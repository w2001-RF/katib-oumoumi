// Provider-agnostic AI interfaces. Nothing outside `_shared/ai/` knows which
// vendor (Gemini, Groq, OpenRouter, Ollama, Claude, OpenAI...) is behind them.

export interface ModelCapabilities {
  /** Native function calling. Not required by the agent (it runs its own state machine). */
  tools: boolean;
  /** How structured output can be requested: a JSON schema, plain JSON mode, or only by asking. */
  json: 'schema' | 'object' | 'none';
  /** Accepts `image_url` content parts. */
  vision: boolean;
  /** Accepts `input_audio` content parts (lets the agent skip speech-to-text). */
  audioInput: boolean;
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } } // data: URL
  | { type: 'input_audio'; input_audio: { data: string; format: string } }; // base64

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** What the call is for (intent, extraction...); only used for telemetry, never sent. */
  task?: string;
}

export type JsonSchema = Record<string, unknown>;

export interface LLM {
  readonly name: string;
  readonly caps: ModelCapabilities;
  chat(req: ChatRequest): Promise<string>;
  /** Structured output that works on every model (see BaseLLM.json). */
  json<T>(req: ChatRequest, schema: JsonSchema, schemaName: string): Promise<T>;
}

export interface SpeechToText {
  /**
   * `seconds`: length of the recording when the channel knows it (for usage and cost).
   * `hint`: words likely to be said (document, expected fields, list values), to spell them right.
   */
  transcribe(audio: Uint8Array, mime: string, seconds?: number, hint?: string): Promise<string>;
}

export interface TextToSpeech {
  /** `voice` is true when the result is OGG/Opus (a voice note), false for other audio. */
  speak(text: string): Promise<{ data: Uint8Array; mime: string; voice: boolean }>;
}

export class LLMError extends Error {
  /**
   * @param retryable another provider may succeed (the FallbackLLM moves on)
   * @param retryAfterMs the provider's Retry-After, when it sent one
   */
  constructor(message: string, readonly status: number | null, readonly retryable: boolean, readonly retryAfterMs?: number) {
    super(message);
    this.name = 'LLMError';
  }

  /** Overload or network trouble that usually passes: worth retrying the same model. */
  get transient(): boolean {
    return this.retryable && this.status !== 404;
  }
}
