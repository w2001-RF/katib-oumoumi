import type { ChatRequest, JsonSchema, LLM, ModelCapabilities } from './types.ts';
import { LLMError } from './types.ts';

// Tries each model in order and moves on when one is rate-limited, down or
// times out (typical of free tiers). Non-retryable errors (bad key, bad
// request) are thrown at once: falling back would only hide a config mistake.
export class FallbackLLM implements LLM {
  readonly name: string;
  readonly caps: ModelCapabilities;

  constructor(private readonly chain: LLM[]) {
    if (!chain.length) throw new Error('FallbackLLM needs at least one model');
    this.name = chain.map((m) => m.name).join(' → ');
    // Callers choose what to send (images, audio) from these, so only promise
    // what every model in the chain can do.
    this.caps = {
      tools: chain.every((m) => m.caps.tools),
      json: chain[0].caps.json,
      vision: chain.every((m) => m.caps.vision),
      audioInput: chain.every((m) => m.caps.audioInput),
    };
  }

  private async run<T>(call: (m: LLM) => Promise<T>): Promise<T> {
    let last: unknown;
    for (const model of this.chain) {
      try {
        return await call(model);
      } catch (e) {
        last = e;
        if (!(e instanceof LLMError) || !e.retryable) throw e;
        console.warn(`[ai] ${model.name} failed (${e.message}); trying next model`);
      }
    }
    throw last;
  }

  chat(req: ChatRequest): Promise<string> {
    return this.run((m) => m.chat(req));
  }

  json<T>(req: ChatRequest, schema: JsonSchema, schemaName: string): Promise<T> {
    return this.run((m) => m.json<T>(req, schema, schemaName));
  }
}
