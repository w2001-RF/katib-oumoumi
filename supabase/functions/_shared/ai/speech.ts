import { joinUrl } from './openaiCompatible.ts';
import type { LLM, SpeechToText, TextToSpeech } from './types.ts';
import { LLMError } from './types.ts';
import { encodeBase64, toBlob } from './base64.ts';

function auth(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/amr': 'amr',
};

// OpenAI-style `POST /audio/transcriptions`: OpenAI, Groq (whisper-large-v3,
// free tier), self-hosted faster-whisper / Speaches, LocalAI...
export class OpenAICompatibleSTT implements SpeechToText {
  constructor(private readonly baseUrl: string, private readonly apiKey: string, private readonly model: string,
    private readonly language?: string) {}

  async transcribe(audio: Uint8Array, mime: string): Promise<string> {
    const base = mime.split(';')[0].trim();
    const form = new FormData();
    form.append('file', toBlob(audio, base), `voice.${EXT_BY_MIME[base] || 'ogg'}`);
    form.append('model', this.model);
    if (this.language) form.append('language', this.language);
    const res = await fetch(joinUrl(this.baseUrl, 'audio/transcriptions'), {
      method: 'POST', headers: auth(this.apiKey), body: form, signal: AbortSignal.timeout(60000),
    });
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
    private readonly voice: string, private readonly format = 'opus') {}

  async speak(text: string) {
    const res = await fetch(joinUrl(this.baseUrl, 'audio/speech'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(this.apiKey) },
      body: JSON.stringify({ model: this.model, voice: this.voice, input: text, response_format: this.format }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new LLMError(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status, res.status >= 500);
    const data = new Uint8Array(await res.arrayBuffer());
    return { data, mime: TTS_MIME[this.format] ?? `audio/${this.format}`, voice: this.format === 'opus' };
  }
}
