import { assert, assertEquals } from 'jsr:@std/assert@1';
import { checkPage, isExternal, sriHash, stylesheetLinks } from '../../tools/sri.js';

const enc = (s) => new TextEncoder().encode(s);

Deno.test('sriHash: sha384 in the SRI format', async () => {
  // Known value: printf 'abc' | openssl dgst -sha384 -binary | base64
  assertEquals(await sriHash(enc('abc')), 'sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn');
});

Deno.test('stylesheetLinks / isExternal', () => {
  const html = `<link rel="icon" href="a.svg" /><link rel="stylesheet" href="css/x.css" integrity="sha384-x" />
    <link href="https://cdn.example/y.css" rel="stylesheet">`;
  assertEquals(stylesheetLinks(html).map((l) => [l.href, l.integrity]), [['css/x.css', 'sha384-x'], ['https://cdn.example/y.css', null]]);
  assertEquals(['https://a/b', '//a/b', 'css/a.css', 'fonts/f.css'].map(isExternal), [true, true, false, false]);
});

Deno.test('checkPage: adds, updates and accepts hashes; flags external sheets', async () => {
  const files = { 'a.css': enc('a{}'), 'b.css': enc('b{}') };
  const good = await sriHash(files['b.css']);
  const html = `<link rel="stylesheet" href="a.css" />\n<link rel="stylesheet" href="b.css" integrity="${good}" />\n` +
    `<link rel="stylesheet" href="c.css" integrity="sha384-old">\n<link rel="stylesheet" href="https://x/y.css" />`;
  files['c.css'] = enc('c{}');
  const { problems, fixed } = await checkPage(html, (href) => files[href]);
  assertEquals(problems.length, 3);
  assert(problems[0].startsWith('a.css: integrity missing'));
  assert(problems[1].startsWith('c.css: integrity out of date'));
  assert(problems[2].includes('external stylesheet'));
  assert(fixed.includes(`href="a.css" integrity="${await sriHash(files['a.css'])}" />`));
  assert(fixed.includes(`href="c.css" integrity="${await sriHash(files['c.css'])}">`));

  const again = await checkPage(fixed.replace(/<link[^>]*https:[^>]*>/, ''), (href) => files[href]);
  assertEquals(again.problems, []);
});

// The real page: every stylesheet is self-hosted and its hash is current.
// If this fails after editing a .css file: npx deno run --allow-read --allow-write tools/sri.js --write
Deno.test('index.html: stylesheet integrity hashes are up to date', async () => {
  const root = new URL('../../', import.meta.url);
  const html = await Deno.readTextFile(new URL('index.html', root));
  assert(stylesheetLinks(html).length >= 2, 'fonts + styles');
  const { problems } = await checkPage(html, (href) => Deno.readFile(new URL(href, root)));
  assertEquals(problems, []);
});
