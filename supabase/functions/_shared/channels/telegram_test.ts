// Run: npx deno test --allow-env supabase/functions/_shared
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { jsonResponse, withFetch } from '../testing/fakeFetch.ts';
import { splitText, TelegramChannel } from './telegram.ts';

const tg = new TelegramChannel('TOKEN');
const okResult = (result: unknown = true) => jsonResponse({ ok: true, result });
const method = (url: string) => url.split('/').pop();

Deno.test('splitText keeps short texts and cuts long ones at line breaks', () => {
  assertEquals(splitText('abc', 10), ['abc']);
  assertEquals(splitText('aaaa\nbbbb\ncccc', 10), ['aaaa\nbbbb', 'cccc']);
  assertEquals(splitText('x'.repeat(25), 10), ['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
});

Deno.test('sendText: buttons go on the last chunk only', async () => {
  await withFetch(() => okResult(), async (reqs) => {
    await tg.sendText('7', `${'a'.repeat(3990)}\n${'b'.repeat(20)}`, [[{ label: 'نعم', action: 'confirm:yes' }]]);
    assertEquals(reqs.length, 2);
    assertEquals((reqs[0].json as { reply_markup?: unknown }).reply_markup, undefined);
    assertEquals((reqs[1].json as { reply_markup: unknown }).reply_markup, {
      inline_keyboard: [[{ text: 'نعم', callback_data: 'confirm:yes' }]],
    });
    assertEquals(reqs[0].url, 'https://api.telegram.org/botTOKEN/sendMessage');
  });
});

Deno.test('API errors are raised; chat actions and callback answers are best effort', async () => {
  await withFetch(() => jsonResponse({ ok: false, description: 'chat not found' }, 400), async () => {
    await assertRejects(() => tg.sendText('7', 'x'), Error, 'chat not found');
    await tg.showActivity('7', 'typing');
    await tg.answerCallback('cb');
  });
});

Deno.test('voice, audio and documents are sent as multipart files', async () => {
  await withFetch(() => okResult(), async (reqs) => {
    await tg.sendVoice('7', { data: new Uint8Array([1]), mime: 'audio/ogg', voice: true });
    await tg.sendVoice('7', { data: new Uint8Array([1]), mime: 'audio/mpeg', voice: false });
    await tg.sendDocument('7', { data: new Uint8Array([1]), filename: 'شكاية.pdf', mime: 'application/pdf' }, 'جاهزة');
    await tg.sendDocument('7', { data: new Uint8Array([1]), filename: 'a.html', mime: 'text/html' });
    assertEquals(reqs.map((r) => method(r.url)), ['sendVoice', 'sendAudio', 'sendDocument', 'sendDocument']);
    assertEquals((reqs[2].form?.get('document') as File).name, 'شكاية.pdf');
    assertEquals(reqs[2].form?.get('caption'), 'جاهزة');
    assertEquals(reqs[3].form?.get('caption'), null);
  });
});

// Answers getFile, then the file download.
const fileServer = (size = 3) => (req: { url: string }) =>
  req.url.endsWith('/getFile') ? okResult({ file_path: 'voice/1.oga', file_size: size }) : new Response(new Uint8Array([1, 2, 3]));

Deno.test('parseUpdate: text, voice, photo, image document', async () => {
  await withFetch(fileServer(), async () => {
    const base = { from: { id: 42, first_name: 'Fatima', last_name: 'Z' }, chat: { id: 42, type: 'private' } };
    const text = await tg.parseUpdate({ update_id: 1, message: { ...base, text: 'سلام' } });
    assertEquals([text?.text, text?.displayName, text?.chatId, text?.updateId], ['سلام', 'Fatima Z', '42', 1]);

    const voice = await tg.parseUpdate({ update_id: 2, message: { ...base, voice: { file_id: 'v', mime_type: 'audio/ogg' } } });
    assertEquals(voice?.audio?.data, new Uint8Array([1, 2, 3]));

    const audio = await tg.parseUpdate({ update_id: 2, message: { ...base, audio: { file_id: 'a' } } });
    assertEquals(audio?.audio?.mime, 'audio/ogg');

    const photo = await tg.parseUpdate({ update_id: 3, message: { ...base, caption: 'هادي لاكارط', photo: [{ file_id: 's' }, { file_id: 'l' }] } });
    assertEquals([photo?.text, photo?.image?.mime], ['هادي لاكارط', 'image/jpeg']);

    const scan = await tg.parseUpdate({ update_id: 4, message: { ...base, document: { file_id: 'd', mime_type: 'image/png' } } });
    assertEquals(scan?.image?.mime, 'image/png');
  });
});

Deno.test('parseUpdate: unsupported media, groups, edits and button presses', async () => {
  await withFetch(() => okResult(), async () => {
    const base = { from: { id: 42 }, chat: { id: 42, type: 'private' } };
    assertEquals((await tg.parseUpdate({ update_id: 1, message: { ...base, document: { file_id: 'd', mime_type: 'application/pdf' } } }))?.unsupported, 'application/pdf');
    assertEquals((await tg.parseUpdate({ update_id: 1, message: { ...base, document: { file_id: 'd' } } }))?.unsupported, 'document');
    assertEquals((await tg.parseUpdate({ update_id: 1, message: { ...base, sticker: {} } }))?.unsupported, 'media');
    assertEquals(await tg.parseUpdate({ update_id: 1, message: { ...base, chat: { id: 1, type: 'group' }, text: 'x' } }), null);
    assertEquals(await tg.parseUpdate({ update_id: 1, edited_message: {} }), null);

    const press = await tg.parseUpdate({ update_id: 5, callback_query: { id: 'cb', data: 'confirm:yes', from: { id: 42, first_name: 'F' }, message: { chat: { id: 42 } } } });
    assertEquals([press?.action, press?.chatId, press?.displayName], ['confirm:yes', '42', 'F']);
    assertEquals(await tg.parseUpdate({ update_id: 6, callback_query: { id: 'cb', from: { id: 42 } } }), null);
  });
});

Deno.test('downloads refuse big files and failed transfers', async () => {
  await withFetch(fileServer(50 * 1024 * 1024), async () => {
    await assertRejects(() => tg.download('big'), Error, 'too large');
  });
  await withFetch((req) => (req.url.endsWith('/getFile') ? okResult({ file_path: 'x' }) : new Response('', { status: 404 })), async () => {
    await assertRejects(() => tg.download('gone'), Error, '404');
  });
});

Deno.test('setMyCommands: the command menu, optionally per language', async () => {
  await withFetch(() => okResult(), async (reqs) => {
    const commands = [{ command: 'help', description: 'المساعدة' }];
    await tg.setMyCommands(commands);
    await tg.setMyCommands(commands, 'ar');
    assertEquals(reqs.map((r) => method(r.url)), ['setMyCommands', 'setMyCommands']);
    assertEquals(reqs[0].json, { commands });
    assertEquals(reqs[1].json, { commands, language_code: 'ar' });
  });
});
