// What the agent needs from a messaging channel. Telegram implements it
// today; a WhatsApp Cloud API adapter only has to implement the same four
// methods plus its own webhook parsing.

/**
 * Longer voice notes are not downloaded nor transcribed: the answers the bot
 * needs are short, and transcription is paid by the minute. The user is asked
 * to split it (MSG.voiceTooLong).
 */
export const MAX_VOICE_SECONDS = 180;

export interface Button {
  label: string;
  action: string; // comes back as IncomingMessage.action
}

export interface Channel {
  readonly name: 'telegram' | 'whatsapp' | 'web';
  sendText(chatId: string, text: string, buttons?: Button[][]): Promise<void>;
  sendVoice(chatId: string, audio: { data: Uint8Array; mime: string; voice: boolean }): Promise<void>;
  sendDocument(chatId: string, file: { data: Uint8Array; filename: string; mime: string }, caption?: string): Promise<void>;
  /** "typing…" / "recording…" indicator while the agent works. Best effort. */
  showActivity(chatId: string, kind: 'typing' | 'upload_document' | 'record_voice'): Promise<void>;
}
