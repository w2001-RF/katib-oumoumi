import { errorKindFor, providerOf, redact } from '../metrics/classify.ts';
import { type CallObserver, emit, type ServiceKind } from '../metrics/types.ts';
import { joinUrl } from './openaiCompatible.ts';
import type { LLM, SpeechToText, TextToSpeech } from './types.ts';
import { LLMError } from './types.ts';
import { encodeBase64, toBlob } from './base64.ts';

function auth(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

// Runs one speech request and tells the observer how it went.
async function observed<T>(observe: CallObserver | undefined, base: { service: ServiceKind; baseUrl: string; model: string;
  operation: string; units?: number }, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const event = { service: base.service, provider: providerOf(base.baseUrl), model: base.model, operation: base.operation,
    task: base.operation, units: base.units };
  try {
    const result = await run();
    emit(observe, { ...event, ok: true, httpStatus: 200, latencyMs: Date.now() - started });
    return result;
  } catch (e) {
    const status = e instanceof LLMError ? e.status : null;
    const message = (e as Error).message ?? String(e);
    emit(observe, { ...event, ok: false, httpStatus: status, errorKind: errorKindFor(status, message), error: redact(message),
      latencyMs: Date.now() - started });
    throw e;
  }
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/amr': 'amr',
};

// OpenAI-style `POST /audio/transcriptions`: OpenAI, Groq (whisper-large-v3,
// free tier), self-hosted faster-whisper / Speaches, LocalAI...
export class OpenAICompatibleSTT implements SpeechToText {
  constructor(private readonly baseUrl: string, private readonly apiKey: string, private readonly model: string,
    private readonly language?: string, private readonly observe?: CallObserver) {}

  transcribe(audio: Uint8Array, mime: string, seconds?: number): Promise<string> {
    return observed(this.observe, { service: 'stt', baseUrl: this.baseUrl, model: this.model, operation: 'transcribe', units: seconds },
      () => this.request(audio, mime));
  }

  private async request(audio: Uint8Array, mime: string): Promise<string> {
    const base = mime.split(';')[0].trim();
    const form = new FormData();
    form.append('file', toBlob(audio, base), `voice.${EXT_BY_MIME[base] || 'ogg'}`);
    form.append('model', this.model);
    if (this.language) form.append('language', this.language);
    let res: Response;
    try {
      res = await fetch(joinUrl(this.baseUrl, 'audio/transcriptions'), {
        method: 'POST', headers: auth(this.apiKey), body: form, signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      throw new LLMError(`STT request failed: ${(e as Error).message}`, null, true);
    }
    if (!res.ok) throw new LLMError(`STT HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status, res.status >= 500);
    const data = await res.json();
    return String(data.text || '').trim();
  }
}

// For models that hear audio themselves (e.g. Gemini): ask them for a transcript.
export class LLMAudioSTT implements SpeechToText {
  constructor(private readonly llm: LLM) {}

  async transcribe(audio: Uint8Array, mime: string): Promise<string> {
    const format = (EXT_BY_MIME[mime.split(';')[0].trim()] || 'ogg');
    const text = await this.llm.chat({
      task: 'transcribe',
      temperature: 0,
      messages: [
        { role: 'system', content: 'Transcribe the voice note word for word in the language spoken (often Moroccan Darija mixed with Arabic or French). Output only the transcript.' },
        { role: 'user', content: [{ type: 'input_audio', input_audio: { data: encodeBase64(audio), format } }] },
      ],
    });
    return text.trim();
  }
}

const TTS_MIME: Record<string, string> = { opus: 'audio/ogg', mp3: 'audio/mpeg' };

// OpenAI-style `POST /audio/speech`: OpenAI, Speaches/Kokoro, LocalAI...
// With format "opus" the result is OGG/Opus, which messaging apps play as a voice note.
export class OpenAICompatibleTTS implements TextToSpeech {
  constructor(private readonly baseUrl: string, private readonly apiKey: string, private readonly model: string,
    private readonly voice: string, private readonly format = 'opus', private readonly observe?: CallObserver) {}

  speak(text: string) {
    return observed(this.observe, { service: 'tts', baseUrl: this.baseUrl, model: this.model, operation: 'speak', units: text.length },
      () => this.request(text));
  }

  private async request(text: string) {
    let res: Response;
    try {
      res = await fetch(joinUrl(this.baseUrl, 'audio/speech'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth(this.apiKey) },
        body: JSON.stringify({ model: this.model, voice: this.voice, input: text, response_format: this.format }),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      throw new LLMError(`TTS request failed: ${(e as Error).message}`, null, true);
    }
    if (!res.ok) throw new LLMError(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status, res.status >= 500);
    const data = new Uint8Array(await res.arrayBuffer());
    return { data, mime: TTS_MIME[this.format] ?? `audio/${this.format}`, voice: this.format === 'opus' };
  }
}
