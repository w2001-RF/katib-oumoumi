// Shapes shared by the agent modules. Field and document rows are the ones the
// web app already reads (v_template_fields, document_types).

import type { HistoryEntry } from './memory.ts';

export interface TemplateField {
  field_id: string;
  field_key: string;
  label_ar: string;
  field_type: 'varchar' | 'text' | 'int' | 'date' | 'phone' | 'email' | 'cin' | 'select';
  placeholder_ar: string;
  is_required: boolean;
  sort_order: number;
  options: string[];
  ask_prompt?: string; // agent_field_hints.ask_prompt
}

export interface CatalogEntry {
  id: string;
  name_ar: string;
  description_ar: string;
  keywords: string;
}

export interface AgentDocument {
  id: string;
  name_ar: string;
  template_body: string;
  fields: TemplateField[];
  next_steps_ar: string;
  /** profile attribute -> field_key */
  self_fields: Record<string, string>;
}

export interface AgentUser {
  id: string;
  channel: string;
  external_id: string;
  display_name: string;
  prefers_voice: boolean;
  consent_at: string | null;
}

export type ConversationStatus = 'choosing' | 'collecting' | 'confirming' | 'done' | 'cancelled';

export interface Conversation {
  id: string;
  user_id: string;
  status: ConversationStatus;
  document_type_id: string | null;
  candidate_ids: string[];
  field_values: Record<string, string>;
  /** Darija summaries of rewritten long-text fields, read back in voice confirmations. */
  field_summaries: Record<string, string>;
  skipped_keys: string[];
  asked_keys: string[];
  /** Last few exchanges, shown to the model as context (memory.ts; migration 004). */
  history?: HistoryEntry[];
}

export interface IncomingMessage {
  channel: 'telegram' | 'whatsapp' | 'web';
  externalUserId: string;
  chatId: string;
  displayName: string;
  /** Monotonic per user (Telegram update_id); used to drop webhook retries. */
  updateId: number;
  text?: string;
  /** `seconds`: length of the voice note, when the channel says. */
  audio?: { data: Uint8Array; mime: string; seconds?: number };
  /** A voice note too long to be transcribed (its length in seconds); not downloaded. */
  audioTooLong?: number;
  image?: { data: Uint8Array; mime: string };
  /** A button press: "consent:yes", "doc:<uuid>", "confirm:yes", "confirm:edit". */
  action?: string;
  /** Something we received but cannot read (e.g. a PDF file). */
  unsupported?: string;
  /** Date.now() when the update arrived (before media downloads), for response-time metrics. */
  receivedAt?: number;
}
