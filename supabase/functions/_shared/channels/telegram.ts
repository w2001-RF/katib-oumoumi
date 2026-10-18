// Telegram Bot API adapter: turns webhook updates into IncomingMessage and
// implements Channel for replies.

import type { IncomingMessage } from '../agent/types.ts';
import { toBlob } from '../ai/base64.ts';
import { errorKindFor, redact } from '../metrics/classify.ts';
import { type CallObserver, emit } from '../metrics/types.ts';
import { type Button, type Channel, MAX_VOICE_SECONDS } from './types.ts';

const API = 'https://api.telegram.org';
const MAX_TEXT = 4000; // Telegram limit is 4096
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // Bot API getFile limit
// Typing indicators are frequent and best effort: not worth a telemetry row.
const UNRECORDED_METHODS = new Set(['sendChatAction']);

export class TelegramApiError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = 'TelegramApiError';
  }
}

export class TelegramChannel implements Channel {
  readonly name = 'telegram' as const;

  /** `observe` receives one telemetry event per Bot API call (see _shared/metrics). */
  constructor(private readonly token: string, private readonly observe?: CallObserver,
    private readonly maxVoiceSeconds = MAX_VOICE_SECONDS) {}

  private async call(method: string, body: Record<string, unknown> | FormData): Promise<any> {
    return await this.observed(method, async () => {
      const isForm = body instanceof FormData;
      let res: Response;
      try {
        res = await fetch(`${API}/bot${this.token}/${method}`, {
          method: 'POST',
          headers: isForm ? {} : { 'Content-Type': 'application/json' },
          body: isForm ? body : JSON.stringify(body),
          signal: AbortSignal.timeout(60000),
        });
      } catch (e) {
        // The message of a network error contains the URL, hence the bot token.
        throw new TelegramApiError(`Telegram ${method} unreachable: ${redact((e as Error).message)}`, null);
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new TelegramApiError(`Telegram ${method} failed: ${res.status} ${data.description ?? ''}`, res.status);
      return data.result;
    });
  }

  private async observed<T>(operation: string, run: () => Promise<T>): Promise<T> {
    const started = Date.now();
    const event = { service: 'channel' as const, provider: 'telegram', operation };
    try {
      const result = await run();
      if (!UNRECORDED_METHODS.has(operation)) emit(this.observe, { ...event, ok: true, httpStatus: 200, latencyMs: Date.now() - started });
      return result;
    } catch (e) {
      const status = e instanceof TelegramApiError ? e.status : null;
      const message = (e as Error).message;
      emit(this.observe, { ...event, ok: false, httpStatus: status, errorKind: errorKindFor(status, message), error: redact(message),
        latencyMs: Date.now() - started });
      throw e;
    }
  }

  async sendText(chatId: string, text: string, buttons?: Button[][]) {
    const chunks = splitText(text);
    for (let i = 0; i < chunks.length; i++) {
      const last = i === chunks.length - 1;
      await this.call('sendMessage', {
        chat_id: chatId,
        text: chunks[i],
        ...(last && buttons?.length
          ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => ({ text: b.label, callback_data: b.action }))) } }
          : {}),
      });
    }
  }

  async sendVoice(chatId: string, audio: { data: Uint8Array; mime: string; voice: boolean }) {
    const form = new FormData();
    form.append('chat_id', chatId);
    const field = audio.voice ? 'voice' : 'audio';
    form.append(field, toBlob(audio.data, audio.mime), audio.voice ? 'reply.ogg' : 'reply.mp3');
    await this.call(audio.voice ? 'sendVoice' : 'sendAudio', form);
  }

  async sendDocument(chatId: string, file: { data: Uint8Array; filename: string; mime: string }, caption?: string) {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', toBlob(file.data, file.mime), file.filename);
    if (caption) form.append('caption', caption);
    await this.call('sendDocument', form);
  }

  async showActivity(chatId: string, kind: 'typing' | 'upload_document' | 'record_voice') {
    await this.call('sendChatAction', { chat_id: chatId, action: kind }).catch(() => {});
  }

  /** The command menu shown by Telegram next to the input box (set_commands.ts). */
  async setMyCommands(commands: { command: string; description: string }[], languageCode?: string) {
    await this.call('setMyCommands', { commands, ...(languageCode ? { language_code: languageCode } : {}) });
  }

  async answerCallback(callbackId: string) {
    await this.call('answerCallbackQuery', { callback_query_id: callbackId }).catch(() => {});
  }

  async download(fileId: string): Promise<Uint8Array> {
    const info = await this.call('getFile', { file_id: fileId });
    if (info.file_size && info.file_size > MAX_DOWNLOAD_BYTES) throw new Error('File too large');
    return await this.observed('downloadFile', async () => {
      const res = await fetch(`${API}/file/bot${this.token}/${info.file_path}`, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new TelegramApiError(`Telegram file download failed: ${res.status}`, res.status);
      return new Uint8Array(await res.arrayBuffer());
    });
  }

  // Webhook update -> IncomingMessage. Null for updates the bot ignores
  // (edits, group events...). Media is downloaded here.
  async parseUpdate(update: any): Promise<IncomingMessage | null> {
    if (update.callback_query) {
      const cq = update.callback_query;
      await this.answerCallback(cq.id);
      if (!cq.message) return null;
      return {
        channel: 'telegram',
        externalUserId: String(cq.from.id),
        chatId: String(cq.message.chat.id),
        displayName: displayName(cq.from),
        updateId: update.update_id,
        action: String(cq.data ?? ''),
      };
    }
    const m = update.message;
    if (!m?.from || m.chat?.type !== 'private') return null;
    const msg: IncomingMessage = {
      channel: 'telegram',
      externalUserId: String(m.from.id),
      chatId: String(m.chat.id),
      displayName: displayName(m.from),
      updateId: update.update_id,
      text: m.text ?? m.caption ?? '',
    };
    const voice = m.voice ?? m.audio;
    const seconds = Number(voice?.duration) || undefined;
    if (voice && seconds && seconds > this.maxVoiceSeconds) {
      msg.audioTooLong = seconds;
    } else if (voice) {
      msg.audio = { data: await this.download(voice.file_id), mime: voice.mime_type || 'audio/ogg', seconds };
    } else if (m.photo?.length) {
      const largest = m.photo[m.photo.length - 1];
      msg.image = { data: await this.download(largest.file_id), mime: 'image/jpeg' };
    } else if (m.document) {
      const mime = String(m.document.mime_type || '');
      if (mime.startsWith('image/')) msg.image = { data: await this.download(m.document.file_id), mime };
      else msg.unsupported = mime || 'document';
    } else if (m.video || m.video_note || m.sticker || m.location || m.contact) {
      msg.unsupported = 'media';
    }
    return msg;
  }
}

function displayName(from: { first_name?: string; last_name?: string }): string {
  return [from.first_name, from.last_name].filter(Boolean).join(' ');
}

export function splitText(text: string, max = MAX_TEXT): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
