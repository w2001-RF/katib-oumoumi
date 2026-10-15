import { parseJsonReply } from './json.ts';
import type { ChatRequest, JsonSchema, LLM, ModelCapabilities } from './types.ts';
import { LLMError } from './types.ts';

export interface EndpointConfig {
  baseUrl: string; // e.g. https://generativelanguage.googleapis.com/v1beta/openai/
  apiKey: string;  // may be empty for a local Ollama / vLLM server
  model: string;
  caps: ModelCapabilities;
  timeoutMs?: number;
}

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

// Throws an LLMError; 404/408/429/5xx and network failures are retryable (the
// FallbackLLM then tries the next provider).
export async function postJson(url: string, apiKey: string, body: unknown, timeoutMs: number): Promise<any> {
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
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 500);
    // 404: providers retire and rename models (Google retired gemini-2.5-flash
    // for new keys), so let the fallback model take over and say what to fix.
    const hint = res.status === 404 ? ' — model not found: it may be retired or misspelled, check LLM_*MODEL' : '';
    const retryable = [404, 408, 429].includes(res.status) || res.status >= 500;
    throw new LLMError(`HTTP ${res.status} from ${url}${hint}: ${detail}`, res.status, retryable);
  }
  return res.json();
}

// One adapter for every provider that speaks the OpenAI Chat Completions
// format: Google AI Studio, Groq, OpenRouter, Mistral, Together, Ollama,
// vLLM, LM Studio, OpenAI, Anthropic's compatibility endpoint...
export class OpenAICompatibleLLM implements LLM {
  readonly name: string;
  readonly caps: ModelCapabilities;

  constructor(private readonly cfg: EndpointConfig) {
    this.name = cfg.model;
    this.caps = cfg.caps;
  }

  async chat(req: ChatRequest, responseFormat?: unknown): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
    };
    if (req.maxTokens) body.max_tokens = req.maxTokens;
    if (responseFormat) body.response_format = responseFormat;
    const data = await postJson(joinUrl(this.cfg.baseUrl, 'chat/completions'), this.cfg.apiKey, body, this.cfg.timeoutMs ?? 45000);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    // Some servers return content parts even for plain text answers.
    if (Array.isArray(content)) return content.map((p: { text?: string }) => p.text || '').join('');
    throw new LLMError(`Empty reply from ${this.cfg.model}`, null, true);
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
    const first = await this.chat({ ...req, messages }, format);
    try {
      return parseJsonReply<T>(first);
    } catch {
      const retry = await this.chat(
        {
          ...req,
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
