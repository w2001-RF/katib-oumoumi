// The agent's conversation logic: a small state machine driven by the
// database, not by the model. The template's own fields (v_template_fields)
// decide what is still missing; the web app's validators decide what is
// valid; the model only does the narrow tasks in tasks.ts. This is what makes
// any model — free tier, open source, local — good enough to run it.
//
//   (no consent) ──yes──► choosing ──document──► collecting ──all filled──► confirming ──yes──► done
//                             ▲                                                │ correction
//                             └────────────── /new, cancel ◄───────────────────┘

import { formatDateAr } from '../../../../js/utils/format.js';
import { renderTemplate } from '../../../../js/utils/templateEngine.js';
import { validateField } from '../../../../js/utils/validators.js';
import type { Role } from '../ai/registry.ts';
import type { LLM, SpeechToText, TextToSpeech } from '../ai/types.ts';
import type { Button, Channel } from '../channels/types.ts';
import type { DocumentRenderer } from '../docs/render.ts';
import { isCancel, isYes, MSG } from './messages.ts';
import { normalizeValue } from './normalize.ts';
import type { AgentStore } from './store.ts';
import { detectIntent, extractFields, type ExtractResult, phraseQuestion, rewriteFormal } from './tasks.ts';
import type { AgentDocument, AgentUser, CatalogEntry, Conversation, IncomingMessage, TemplateField } from './types.ts';

export interface AgentDeps {
  store: AgentStore;
  channel: Channel;
  llm: (role: Role) => LLM;
  stt: SpeechToText | null;
  tts: TextToSpeech | null;
  renderer: DocumentRenderer;
  today?: () => string; // YYYY-MM-DD, injectable for tests
}

const INTENT_MIN_CONFIDENCE = 0.6;
const FIELDS_PER_QUESTION_TEXT = 3;
const MAX_CHOICES = 5;

interface Ctx {
  deps: AgentDeps;
  user: AgentUser;
  chatId: string;
}

interface Input {
  text: string;
  image?: { data: Uint8Array; mime: string };
}

// --- entry point -------------------------------------------------------------

export async function handleMessage(deps: AgentDeps, msg: IncomingMessage): Promise<void> {
  const user = await deps.store.upsertUser(msg.channel, msg.externalUserId, msg.displayName);
  if (!(await deps.store.claimUpdate(user.id, msg.updateId))) return; // webhook retry
  const ctx: Ctx = { deps, user, chatId: msg.chatId };
  try {
    await route(ctx, msg);
  } catch (e) {
    console.error('[agent] failed to handle message', e);
    await deps.channel.sendText(msg.chatId, MSG.error).catch(() => {});
  }
}

async function route(ctx: Ctx, msg: IncomingMessage) {
  const text = (msg.text ?? '').trim();
  if (await handleCommand(ctx, text)) return;
  // Nothing reaches an AI provider before the user agrees.
  if (!ctx.user.consent_at) return handleConsent(ctx, text, msg.action);
  if (text === '/start') return say(ctx, MSG.welcome);
  if (isCancel(text)) {
    await ctx.deps.store.cancelConversations(ctx.user.id);
    return say(ctx, MSG.cancelled);
  }
  if (msg.unsupported) return say(ctx, MSG.unsupported);
  return converse(ctx, msg);
}

// Commands that work in every state, before consent too. True when handled.
async function handleCommand(ctx: Ctx, text: string): Promise<boolean> {
  if (text === '/forget') {
    await ctx.deps.store.forgetUser(ctx.user.id);
    await say(ctx, MSG.forgotten, { voice: false });
    return true;
  }
  if (text === '/help') {
    await say(ctx, MSG.help, { voice: false });
    return true;
  }
  return false;
}

async function handleConsent(ctx: Ctx, text: string, action?: string) {
  if (action === 'consent:yes' || (text && isYes(text))) {
    await ctx.deps.store.setConsent(ctx.user.id);
    return say(ctx, MSG.welcome);
  }
  const buttons = [[{ label: MSG.consentButton, action: 'consent:yes' }]];
  return say(ctx, text === '/start' ? MSG.consent : `${MSG.consentNeeded}\n\n${MSG.consent}`, { buttons });
}

async function converse(ctx: Ctx, msg: IncomingMessage) {
  const { store } = ctx.deps;
  const input = await readInput(ctx, msg);
  if (!input) return;

  const conv = (await store.getActiveConversation(ctx.user.id)) ?? (await store.createConversation(ctx.user.id));
  if (conv.status === 'choosing') return choosing(ctx, conv, input, msg.action);

  const doc = conv.document_type_id ? await store.getDocument(conv.document_type_id) : null;
  if (!doc) {
    // The document was unpublished or deleted meanwhile: start over.
    Object.assign(conv, { status: 'choosing', document_type_id: null, field_values: {}, field_summaries: {}, skipped_keys: [], asked_keys: [] });
    return choosing(ctx, conv, input, msg.action);
  }
  if (conv.status === 'collecting') return collecting(ctx, conv, doc, input);
  return confirming(ctx, conv, doc, input, msg.action);
}

// Text of the message, with voice notes transcribed. Replies in the same
// form the user last used (voice ↔ text). Null when nothing usable came in.
async function readInput(ctx: Ctx, msg: IncomingMessage): Promise<Input | null> {
  const { store, stt } = ctx.deps;
  let text = (msg.text ?? '').trim();
  if (msg.audio) {
    if (!stt) {
      await say(ctx, MSG.voiceNotSupported, { voice: false });
      return null;
    }
    await ctx.deps.channel.showActivity(ctx.chatId, 'typing');
    text = await stt.transcribe(msg.audio.data, msg.audio.mime);
    if (!ctx.user.prefers_voice) await store.setPrefersVoice(ctx.user.id, true);
    ctx.user.prefers_voice = true;
    if (!text) {
      await say(ctx, MSG.emptyTranscript);
      return null;
    }
  } else if (text && ctx.user.prefers_voice) {
    await store.setPrefersVoice(ctx.user.id, false);
    ctx.user.prefers_voice = false;
  }
  if (!text && !msg.image && !msg.action) return null;
  return { text, image: msg.image };
}

// --- choosing the document --------------------------------------------------

const MENU_NUMBER_RE = /^\d{1,2}$/;

// A document picked from the last menu, by button or by its number.
function pickedFromMenu(conv: Conversation, input: Input, action?: string): string | null {
  if (action?.startsWith('doc:')) return action.slice(4);
  if (!MENU_NUMBER_RE.test(input.text)) return null;
  return conv.candidate_ids[Number(input.text) - 1] ?? null;
}

async function choosing(ctx: Ctx, conv: Conversation, input: Input, action?: string) {
  const picked = pickedFromMenu(conv, input, action);
  if (picked) return startDocument(ctx, conv, picked, { text: '' });
  if (!input.text) return say(ctx, input.image ? MSG.imageBeforeDocument : MSG.askWhichDocument);

  await ctx.deps.channel.showActivity(ctx.chatId, 'typing');
  const catalog = await ctx.deps.store.listCatalog();
  const intent = await detectIntent(ctx.deps.llm('fast'), input.text, catalog);
  if (intent.document_id && intent.confidence >= INTENT_MIN_CONFIDENCE) {
    // The request that identified the document often already holds values
    // ("my neighbour Ahmed floods my flat in Settat since March...").
    return startDocument(ctx, conv, intent.document_id, input);
  }
  return offerDocuments(ctx, conv, catalog, intent.candidate_ids);
}

async function offerDocuments(ctx: Ctx, conv: Conversation, catalog: CatalogEntry[], candidateIds: string[]) {
  const ids = candidateIds.length ? candidateIds : catalog.slice(0, MAX_CHOICES).map((d) => d.id);
  conv.candidate_ids = ids;
  await ctx.deps.store.saveConversation(conv);
  const names = ids.map((id) => catalog.find((d) => d.id === id)?.name_ar ?? '');
  const list = names.map((name, i) => `${i + 1}. ${name}`).join('\n');
  const buttons: Button[][] = ids.map((id, i) => [{ label: `${i + 1}. ${names[i]}`, action: `doc:${id}` }]);
  const intro = candidateIds.length ? MSG.chooseDocument : MSG.noMatch;
  return say(ctx, `${intro}\n${list}`, { buttons });
}

async function startDocument(ctx: Ctx, conv: Conversation, docId: string, input: Input) {
  const doc = await ctx.deps.store.getDocument(docId);
  if (!doc) return say(ctx, MSG.askWhichDocument);
  Object.assign(conv, { status: 'collecting', document_type_id: doc.id, candidate_ids: [] });
  await prefillFromProfile(ctx, conv, doc);
  await say(ctx, MSG.chosen(doc.name_ar));
  return collecting(ctx, conv, doc, input);
}

async function prefillFromProfile(ctx: Ctx, conv: Conversation, doc: AgentDocument) {
  const entries = Object.entries(doc.self_fields);
  if (!entries.length) return;
  const profile = await ctx.deps.store.getProfile(ctx.user.id);
  for (const [attr, key] of entries) {
    const field = doc.fields.find((f) => f.field_key === key);
    const value = profile[attr];
    if (field && value && !validateField(field, value)) conv.field_values[key] = value;
  }
}

// --- collecting field values -------------------------------------------------

async function collecting(ctx: Ctx, conv: Conversation, doc: AgentDocument, input: Input) {
  let errors: Record<string, string> = {};
  if (input.text || input.image) {
    const open = doc.fields.filter((f) => !(f.field_key in conv.field_values) || conv.asked_keys.includes(f.field_key));
    const result = await extract(ctx, doc, open.length ? open : doc.fields, conv.asked_keys, input);
    if (result) errors = await apply(ctx, conv, doc, result);
  }
  return askNextOrConfirm(ctx, conv, doc, errors, input.text);
}

async function extract(ctx: Ctx, doc: AgentDocument, fields: TemplateField[], askedKeys: string[], input: Input): Promise<ExtractResult | null> {
  let llm = ctx.deps.llm('main');
  let image = input.image;
  if (image && !llm.caps.vision) {
    const vision = ctx.deps.llm('vision');
    if (vision.caps.vision) llm = vision;
    else {
      await say(ctx, MSG.imageNotSupported);
      image = undefined;
    }
  }
  if (!input.text && !image) return null;
  await ctx.deps.channel.showActivity(ctx.chatId, 'typing');
  return extractFields(llm, { text: input.text, image, documentName: doc.name_ar, fields, askedKeys, today: today(ctx) });
}

// Validates extracted values with the web app's validators and stores the
// good ones. Long texts are rewritten in formal Arabic. Returns the errors.
async function apply(ctx: Ctx, conv: Conversation, doc: AgentDocument, result: ExtractResult): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};
  const longTexts: { field: TemplateField; value: string }[] = [];
  for (const [key, raw] of Object.entries(result.values)) {
    const field = doc.fields.find((f) => f.field_key === key);
    if (!field) continue;
    const value = normalizeValue(field, raw);
    const error = validateField(field, value);
    if (error) errors[key] = error;
    else if (field.field_type === 'text') longTexts.push({ field, value });
    else conv.field_values[key] = value;
    if (!error) conv.skipped_keys = conv.skipped_keys.filter((k) => k !== key);
  }
  const rewritten = await Promise.all(
    longTexts.map(({ field, value }) => rewriteFormal(ctx.deps.llm('main'), field.label_ar, doc.name_ar, value)),
  );
  longTexts.forEach(({ field }, i) => {
    conv.field_values[field.field_key] = rewritten[i].formal_ar;
    conv.field_summaries[field.field_key] = rewritten[i].darija_summary;
  });
  for (const key of result.skipped) {
    const field = doc.fields.find((f) => f.field_key === key);
    if (!field || key in conv.field_values) continue;
    if (field.is_required) errors[key] = MSG.requiredCannotSkip(field.label_ar);
    else if (!conv.skipped_keys.includes(key)) conv.skipped_keys.push(key);
  }
  return errors;
}

export function missingFields(doc: AgentDocument, conv: Conversation): TemplateField[] {
  return doc.fields
    .filter((f) => !(f.field_key in conv.field_values) && !conv.skipped_keys.includes(f.field_key))
    .sort((a, b) => Number(b.is_required) - Number(a.is_required) || a.sort_order - b.sort_order);
}

// Next question: rejected fields first; one field at a time for voice users
// and for long texts, a few short ones together otherwise.
export function nextBatch(missing: TemplateField[], errors: Record<string, string>, voice: boolean): TemplateField[] {
  const ordered = [...missing.filter((f) => errors[f.field_key]), ...missing.filter((f) => !errors[f.field_key])];
  if (voice || ordered[0].field_type === 'text') return ordered.slice(0, 1);
  const batch: TemplateField[] = [];
  for (const f of ordered) {
    if (batch.length === FIELDS_PER_QUESTION_TEXT || f.field_type === 'text') break;
    batch.push(f);
  }
  return batch;
}

async function askNextOrConfirm(ctx: Ctx, conv: Conversation, doc: AgentDocument, errors: Record<string, string>, lastText: string) {
  const missing = missingFields(doc, conv);
  if (!missing.length) {
    conv.status = 'confirming';
    conv.asked_keys = [];
    await ctx.deps.store.saveConversation(conv);
    return sendSummary(ctx, conv, doc);
  }
  const batch = nextBatch(missing, errors, ctx.user.prefers_voice);
  conv.asked_keys = batch.map((f) => f.field_key);
  await ctx.deps.store.saveConversation(conv);
  return say(ctx, await question(ctx, batch, errors, lastText));
}

async function question(ctx: Ctx, fields: TemplateField[], errors: Record<string, string>, lastText: string): Promise<string> {
  try {
    const text = await phraseQuestion(ctx.deps.llm('fast'), { fields, errors, lastUserMessage: lastText, voice: ctx.user.prefers_voice });
    if (text) return text;
  } catch (e) {
    console.warn('[agent] phraseQuestion failed, using fixed wording', e);
  }
  return fields
    .map((f) => [errors[f.field_key], f.ask_prompt || fixedQuestion(f)].filter(Boolean).join('\n'))
    .join('\n');
}

// Used when the model is unavailable.
function fixedQuestion(f: TemplateField): string {
  const example = f.placeholder_ar ? ` (${f.placeholder_ar})` : '';
  return `عطيني عافاك: ${f.label_ar}${example}`;
}

// --- confirming --------------------------------------------------------------

function displayValue(field: TemplateField, value: string): string {
  return field.field_type === 'date' ? formatDateAr(value) : value;
}

// For listening: CIN letter by letter, phone digit by digit, long texts as their Darija summary.
function spokenValue(field: TemplateField, value: string, summary?: string): string {
  if (field.field_type === 'cin' || field.field_type === 'phone') return value.split('').join(' ');
  if (field.field_type === 'text') return summary || value;
  return displayValue(field, value);
}

export function buildSummary(doc: AgentDocument, conv: Conversation): { text: string; spoken: string } {
  const filled = doc.fields.filter((f) => f.field_key in conv.field_values);
  const text = filled.map((f) => `• ${f.label_ar}: ${displayValue(f, conv.field_values[f.field_key])}`).join('\n');
  const spoken = filled
    .map((f) => `${f.label_ar}: ${spokenValue(f, conv.field_values[f.field_key], conv.field_summaries[f.field_key])}`)
    .join('. ');
  return {
    text: `${MSG.confirmIntro}\n\n${text}\n\n${MSG.confirmQuestion}`,
    spoken: `${MSG.confirmIntro} ${spoken}. ${MSG.confirmQuestion}`,
  };
}

async function sendSummary(ctx: Ctx, conv: Conversation, doc: AgentDocument) {
  const { text, spoken } = buildSummary(doc, conv);
  const buttons = [[{ label: MSG.confirmYes, action: 'confirm:yes' }], [{ label: MSG.confirmEdit, action: 'confirm:edit' }]];
  return say(ctx, text, { buttons, spoken });
}

async function confirming(ctx: Ctx, conv: Conversation, doc: AgentDocument, input: Input, action?: string) {
  if (action === 'confirm:yes' || (!action && input.text && isYes(input.text))) return generate(ctx, conv, doc);
  if (action === 'confirm:edit' || (!input.text && !input.image)) return say(ctx, MSG.whatToEdit);

  // A correction: any field may change.
  const result = await extract(ctx, doc, doc.fields, [], input);
  if (!result) return say(ctx, MSG.whatToEdit);
  const errors = await apply(ctx, conv, doc, result);
  if (Object.keys(errors).length) {
    const fields = doc.fields.filter((f) => errors[f.field_key]);
    await ctx.deps.store.saveConversation(conv);
    return say(ctx, await question(ctx, fields, errors, input.text));
  }
  if (!Object.keys(result.values).length && !result.skipped.length) return say(ctx, MSG.whatToEdit);
  return askNextOrConfirm(ctx, conv, doc, {}, input.text);
}

// --- generating ----------------------------------------------------------------

async function generate(ctx: Ctx, conv: Conversation, doc: AgentDocument) {
  const { store, channel, renderer } = ctx.deps;
  await say(ctx, MSG.generating, { voice: false });
  await channel.showActivity(ctx.chatId, 'upload_document');

  const html = renderTemplate(doc.template_body, doc.fields, conv.field_values);
  const file = await renderer.render(html, doc.name_ar);
  const caption = file.mime === 'application/pdf' ? MSG.done : `${MSG.done}\n${MSG.htmlFallback}`;
  await channel.sendDocument(ctx.chatId, file, caption);

  conv.status = 'done';
  conv.asked_keys = [];
  await store.saveConversation(conv);
  await store.logGenerated(doc.id, `agent:${ctx.user.channel}:${ctx.user.id}`, conv.field_values);
  await saveProfile(ctx, conv, doc);

  const steps = doc.next_steps_ar ? `${MSG.nextSteps}\n${doc.next_steps_ar}\n\n` : '';
  await say(ctx, `${steps}${MSG.another}`);
}

async function saveProfile(ctx: Ctx, conv: Conversation, doc: AgentDocument) {
  const updates: Record<string, string> = {};
  for (const [attr, key] of Object.entries(doc.self_fields)) {
    if (conv.field_values[key]) updates[attr] = conv.field_values[key];
  }
  if (!Object.keys(updates).length) return;
  const profile = await ctx.deps.store.getProfile(ctx.user.id);
  await ctx.deps.store.saveProfile(ctx.user.id, { ...profile, ...updates });
}

// --- output ------------------------------------------------------------------

function today(ctx: Ctx): string {
  return ctx.deps.today ? ctx.deps.today() : new Date().toISOString().slice(0, 10);
}

// Emoji (with their variation selector), bullets and /commands are not read aloud.
function forSpeech(text: string): string {
  return text.replaceAll(/\p{Extended_Pictographic}️?|•/gu, '').replaceAll(/\/\w+/g, '').trim();
}

// Always sends text (screen readers, records); adds a voice note when the
// user talks to the bot by voice and a TTS provider is configured.
async function say(ctx: Ctx, text: string, opts: { buttons?: Button[][]; spoken?: string; voice?: boolean } = {}) {
  await ctx.deps.channel.sendText(ctx.chatId, text, opts.buttons);
  const { tts } = ctx.deps;
  if (!tts || !ctx.user.prefers_voice || opts.voice === false) return;
  try {
    await ctx.deps.channel.showActivity(ctx.chatId, 'record_voice');
    await ctx.deps.channel.sendVoice(ctx.chatId, await tts.speak(forSpeech(opts.spoken ?? text)));
  } catch (e) {
    console.warn('[agent] TTS failed; text reply was sent', e);
  }
}
