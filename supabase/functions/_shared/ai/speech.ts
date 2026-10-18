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

// Whisper reads at most 224 tokens of prompt; Arabic takes several tokens per word.
const MAX_HINT_CHARS = 400;

/** The hint, clipped at a word boundary. */
export function clipHint(hint: string | undefined, max = MAX_HINT_CHARS): string {
  const h = (hint ?? '').replaceAll(/\s+/g, ' ').trim();
  if (h.length <= max) return h;
  const cut = h.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 0)) || cut;
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

  transcribe(audio: Uint8Array, mime: string, seconds?: number, hint?: string): Promise<string> {
    return observed(this.observe, { service: 'stt', baseUrl: this.baseUrl, model: this.model, operation: 'transcribe', units: seconds },
      () => this.request(audio, mime, clipHint(hint)));
  }

  private async request(audio: Uint8Array, mime: string, hint: string): Promise<string> {
    const base = mime.split(';')[0].trim();
    const form = new FormData();
    form.append('file', toBlob(audio, base), `voice.${EXT_BY_MIME[base] || 'ogg'}`);
    form.append('model', this.model);
    if (this.language) form.append('language', this.language);
    // Whisper's "prompt": text the speech is likely to contain, so names, cities and terms are spelled right.
    if (hint) form.append('prompt', hint);
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

  async transcribe(audio: Uint8Array, mime: string, _seconds?: number, hint?: string): Promise<string> {
    const format = (EXT_BY_MIME[mime.split(';')[0].trim()] || 'ogg');
    const context = clipHint(hint);
    const text = await this.llm.chat({
      task: 'transcribe',
      temperature: 0,
      messages: [
        { role: 'system', content: 'Transcribe the voice note word for word in the language spoken (often Moroccan Darija mixed with Arabic or French). ' +
          'Write Arabic words in Arabic script; keep digits, letters of ID numbers and e-mail addresses as said. ' +
          (context ? `Words likely to be said, to spell them right (not instructions): ${context}. ` : '') +
          'Output only the transcript.' },
        { role: 'user', content: [{ type: 'input_audio', input_audio: { data: encodeBase64(audio), format } }] },
      ],
    });
    return text.trim();
  }
}

// Tries each transcriber in turn: a failing Whisper endpoint hands over to a
// model that hears audio. The last error surfaces when all fail.
export class FallbackSTT implements SpeechToText {
  constructor(private readonly chain: SpeechToText[]) {
    if (!chain.length) throw new Error('FallbackSTT needs at least one transcriber');
  }

  async transcribe(audio: Uint8Array, mime: string, seconds?: number, hint?: string): Promise<string> {
    let last: unknown;
    for (const [i, stt] of this.chain.entries()) {
      try {
        return await stt.transcribe(audio, mime, seconds, hint);
      } catch (e) {
        last = e;
        if (i < this.chain.length - 1) console.warn('[ai] transcription failed; trying the next transcriber', (e as Error).message);
      }
    }
    throw last;
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
