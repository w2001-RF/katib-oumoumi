import { errorKindFor, messageOf, providerOf, readRateLimit, redact } from '../metrics/classify.ts';
import { type CallObserver, emit } from '../metrics/types.ts';
import { parseJsonReply } from './json.ts';
import type { ChatRequest, JsonSchema, LLM, ModelCapabilities } from './types.ts';
import { LLMError } from './types.ts';

export interface EndpointConfig {
  baseUrl: string; // e.g. https://generativelanguage.googleapis.com/v1beta/openai/
  apiKey: string;  // may be empty for a local Ollama / vLLM server
  model: string;
  caps: ModelCapabilities;
  timeoutMs?: number;
  /** Extra attempts on overload/network errors (default 2). */
  retries?: number;
  /** Stop retrying once this much time has passed (default 60 s). */
  retryBudgetMs?: number;
  /** For tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Telemetry: told about every attempt (latency, tokens, errors, rate limits). */
  observe?: CallObserver;
  /** Which role this endpoint serves (main, vision, fast, fallback), for telemetry. */
  role?: string;
}

const DEFAULT_RETRIES = 2;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_DELAY_MS = 8000;
const RETRY_BUDGET_MS = 60000;

// Without regexes: Sonar flags /\/+$/ as a potential backtracking hotspot.
export function trimTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}

export function joinUrl(base: string, path: string): string {
  let start = 0;
  while (start < path.length && path[start] === '/') start++;
  return `${trimTrailingSlashes(base)}/${path.slice(start)}`;
}

function authHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

// Retry-After in seconds (the form AI providers use); undefined when absent.
function retryAfterMs(res: Response): number | undefined {
  const seconds = Number(res.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

// Throws an LLMError; 404/408/429/5xx and network failures are retryable (the
// FallbackLLM then tries the next provider).
// `onResponse` sees the raw response (status, rate-limit headers) before the body is read.
export async function postJson(url: string, apiKey: string, body: unknown, timeoutMs: number,
  onResponse?: (res: Response) => void): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new LLMError(`Request to ${url} failed: ${(e as Error).message}`, null, true);
  }
  onResponse?.(res);
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 500);
    // 404: providers retire and rename models (Google retired gemini-2.5-flash
    // for new keys), so let the fallback model take over and say what to fix.
    const hint = res.status === 404 ? ' — model not found: it may be retired or misspelled, check LLM_*MODEL' : '';
    const retryable = [404, 408, 429].includes(res.status) || res.status >= 500;
    throw new LLMError(`HTTP ${res.status} from ${url}${hint}: ${detail}`, res.status, retryable, retryAfterMs(res));
  }
  return res.json();
}

// Text of a chat completion; null when there is none. Some servers return
// content parts even for plain text answers.
function replyText(data: any): string | null {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p: { text?: string }) => p.text || '').join('');
  return null;
}

// One adapter for every provider that speaks the OpenAI Chat Completions
// format: Google AI Studio, Groq, OpenRouter, Mistral, Together, Ollama,
// vLLM, LM Studio, OpenAI, Anthropic's compatibility endpoint...
export class OpenAICompatibleLLM implements LLM {
  readonly name: string;
  readonly caps: ModelCapabilities;
  private readonly provider: string;

  constructor(private readonly cfg: EndpointConfig) {
    this.name = cfg.model;
    this.caps = cfg.caps;
    this.provider = providerOf(cfg.baseUrl);
  }

  // Free tiers answer 503 "high demand" / 429 often, and it passes within
  // seconds: retry the same model with backoff (honouring Retry-After) before
  // giving up, but stay within a time budget so the function is not killed.
  async chat(req: ChatRequest, responseFormat?: unknown): Promise<string> {
    const retries = this.cfg.retries ?? DEFAULT_RETRIES;
    const sleep = this.cfg.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.chatOnce(req, responseFormat, attempt);
      } catch (e) {
        if (!(e instanceof LLMError) || !e.transient || attempt >= retries) throw e;
        const delay = Math.min(e.retryAfterMs ?? RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
        if (Date.now() - started + delay > (this.cfg.retryBudgetMs ?? RETRY_BUDGET_MS)) throw e;
        console.warn(`[ai] ${this.cfg.model}: ${e.status ?? 'network'} — retry ${attempt + 1}/${retries} in ${delay} ms`);
        await sleep(delay);
      }
    }
  }

  private async chatOnce(req: ChatRequest, responseFormat: unknown, attempt: number): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
    };
    if (req.maxTokens) body.max_tokens = req.maxTokens;
    if (responseFormat) body.response_format = responseFormat;
    const started = Date.now();
    let res: Response | undefined;
    try {
      const data = await postJson(joinUrl(this.cfg.baseUrl, 'chat/completions'), this.cfg.apiKey, body,
        this.cfg.timeoutMs ?? 45000, (r) => (res = r));
      const text = replyText(data);
      if (text === null) throw new LLMError(`Empty reply from ${this.cfg.model}`, null, true);
      this.report(req, attempt, started, res, { usage: data?.usage });
      return text;
    } catch (e) {
      this.report(req, attempt, started, res, { error: e });
      throw e;
    }
  }

  private report(req: ChatRequest, attempt: number, started: number, res: Response | undefined,
    outcome: { usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: unknown }) {
    const { error, usage } = outcome;
    // An empty reply comes with HTTP 200: report the status the server sent.
    const status = res?.status ?? (error instanceof LLMError ? error.status : null);
    const message = error ? messageOf(error) : '';
    emit(this.cfg.observe, {
      service: 'llm',
      provider: this.provider,
      model: this.cfg.model,
      role: this.cfg.role,
      operation: 'chat',
      task: req.task,
      ok: !error,
      httpStatus: status,
      errorKind: error ? errorKindFor(status, message) : undefined,
      error: error ? redact(message) : undefined,
      latencyMs: Date.now() - started,
      attempt,
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      rateLimit: res ? readRateLimit(res.headers) : undefined,
    });
  }

  private responseFormat(schema: JsonSchema, schemaName: string): unknown {
    if (this.caps.json === 'schema') return { type: 'json_schema', json_schema: { name: schemaName, schema, strict: false } };
    if (this.caps.json === 'object') return { type: 'json_object' };
    return undefined;
  }

  // Structured output on any model: the provider's JSON-schema or JSON mode
  // when the model supports it, the schema spelled out in the prompt in every
  // case, and one corrective retry if the reply still does not parse.
  async json<T>(req: ChatRequest, schema: JsonSchema, schemaName: string): Promise<T> {
    const format = this.responseFormat(schema, schemaName);
    const instruction = {
      role: 'system' as const,
      content: `Answer with ONE JSON object only, no prose, no code fences. It must match this JSON schema:\n${JSON.stringify(schema)}`,
    };
    const messages = [...req.messages, instruction];
    const task = req.task ?? schemaName;
    const first = await this.chat({ ...req, task, messages }, format);
    try {
      return parseJsonReply<T>(first);
    } catch {
      const retry = await this.chat(
        {
          ...req,
          task,
          temperature: 0,
          messages: [
            ...messages,
            { role: 'assistant', content: first },
            { role: 'user', content: 'That was not valid JSON. Reply again with the JSON object only.' },
          ],
        },
        format,
      );
      return parseJsonReply<T>(retry);
    }
  }
}
