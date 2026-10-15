// Scores the configured model(s) on the agent's tasks, so switching provider
// is a measured decision. Uses the same LLM_* variables as the bot:
//
//   npx deno run --allow-net --allow-env --allow-read --env-file=eval/.env eval/run.ts
//   npx deno run ... eval/run.ts --role=fast
//
// Prints intent accuracy, field-extraction accuracy (after the same
// normalisation the bot applies), JSON failures and average latency.

import { normalizeValue } from '../supabase/functions/_shared/agent/normalize.ts';
import { detectIntent, extractFields } from '../supabase/functions/_shared/agent/tasks.ts';
import type { CatalogEntry, TemplateField } from '../supabase/functions/_shared/agent/types.ts';
import { getLLM, type Role } from '../supabase/functions/_shared/ai/registry.ts';

interface Cases {
  catalog: CatalogEntry[];
  fields: (Pick<TemplateField, 'field_key' | 'label_ar' | 'field_type' | 'options' | 'is_required'>)[];
  intent: { text: string; expect: string | null }[];
  extraction: { text: string; asked?: string[]; expect: Record<string, string>; expectSkipped?: string[] }[];
}

const role = (Deno.args.find((a) => a.startsWith('--role='))?.split('=')[1] ?? 'main') as Role;
const cases: Cases = JSON.parse(await Deno.readTextFile(new URL('./cases.json', import.meta.url)));
const llm = getLLM(role);
const today = new Date().toISOString().slice(0, 10);
const fields: TemplateField[] = cases.fields.map((f, i) => ({ ...f, field_id: f.field_key, placeholder_ar: '', sort_order: i }));

let failures = 0;
const times: number[] = [];
async function timed<T>(fn: () => Promise<T>): Promise<T | null> {
  const start = performance.now();
  try {
    return await fn();
  } catch (e) {
    failures++;
    console.log(`  ✗ error: ${(e as Error).message.slice(0, 160)}`);
    return null;
  } finally {
    times.push(performance.now() - start);
  }
}

console.log(`Model: ${llm.name} (role ${role}) caps=${JSON.stringify(llm.caps)}\n\nIntent`);
let intentOk = 0;
for (const c of cases.intent) {
  const r = await timed(() => detectIntent(llm, c.text, cases.catalog));
  const got = r && r.confidence >= 0.6 ? r.document_id : null;
  const ok = r !== null && got === c.expect;
  if (ok) intentOk++;
  console.log(`  ${ok ? '✓' : '✗'} ${c.text.slice(0, 50)} → ${got} (expected ${c.expect}, conf ${r?.confidence ?? '-'})`);
}

console.log('\nExtraction');
let fieldOk = 0;
let fieldTotal = 0;
for (const c of cases.extraction) {
  const r = await timed(() => extractFields(llm, { text: c.text, documentName: 'شكاية إدارية', fields, askedKeys: c.asked ?? [], today }));
  for (const [key, want] of Object.entries(c.expect)) {
    fieldTotal++;
    const field = fields.find((f) => f.field_key === key)!;
    const got = r ? normalizeValue(field, r.values[key]) : '';
    const expected = want.replace('{today}', today);
    if (got === expected) fieldOk++;
    console.log(`  ${got === expected ? '✓' : '✗'} ${key}: "${got}" (expected "${expected}")`);
  }
  for (const key of c.expectSkipped ?? []) {
    fieldTotal++;
    const ok = !!r?.skipped.includes(key);
    if (ok) fieldOk++;
    console.log(`  ${ok ? '✓' : '✗'} skipped ${key}`);
  }
}

const avg = times.reduce((a, b) => a + b, 0) / Math.max(times.length, 1);
console.log(`\nIntent ${intentOk}/${cases.intent.length} · Fields ${fieldOk}/${fieldTotal} · Errors ${failures} · Avg ${Math.round(avg)} ms`);
