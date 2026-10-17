// Subresource Integrity for the stylesheets linked from index.html.
//
// Every <link rel="stylesheet"> in index.html points to a file of this site
// and carries integrity="sha384-…", so the browser refuses a stylesheet
// that was altered. This tool keeps those hashes in sync:
//
//   npx deno run --allow-read tools/sri.js            # check (exit 1 if stale)
//   npx deno run --allow-read --allow-write tools/sri.js --write
//
// tests/web/sri_test.js runs the same check in CI. The hashed files must keep
// LF line endings on every machine (.gitattributes), or a Windows checkout
// would hash differently from the deployed copy.

const LINK_RE = /<link\b[^>]*>/g;

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** 'sha384-<base64>' for some bytes. */
export async function sriHash(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-384', bytes));
  let binary = '';
  for (const b of digest) binary += String.fromCodePoint(b);
  return `sha384-${btoa(binary)}`;
}

/** The stylesheet <link> tags of a page: { tag, href, integrity }. */
export function stylesheetLinks(html) {
  return [...html.matchAll(LINK_RE)]
    .map(([tag]) => ({ tag, rel: attr(tag, 'rel'), href: attr(tag, 'href'), integrity: attr(tag, 'integrity') }))
    .filter((l) => l.rel === 'stylesheet')
    .map(({ tag, href, integrity }) => ({ tag, href, integrity }));
}

/** True for a URL served by another site (its content cannot be pinned here). */
export function isExternal(href) {
  return /^(?:[a-z]+:)?\/\//i.test(href);
}

/**
 * Compares every stylesheet's integrity with the hash of its file.
 * `readFile(href)` returns the bytes. Returns the problems found and the
 * page with every integrity set to the right value.
 */
export async function checkPage(html, readFile) {
  const problems = [];
  let fixed = html;
  for (const link of stylesheetLinks(html)) {
    if (isExternal(link.href)) {
      problems.push(`${link.href}: external stylesheet, self-host it to pin its content`);
      continue;
    }
    const expected = await sriHash(await readFile(link.href));
    if (link.integrity === expected) continue;
    problems.push(`${link.href}: integrity ${link.integrity ? 'out of date' : 'missing'} (expected ${expected})`);
    const tag = link.integrity
      ? link.tag.replace(`integrity="${link.integrity}"`, `integrity="${expected}"`)
      : link.tag.replace(/\s*\/?>$/, (end) => ` integrity="${expected}"${end}`);
    fixed = fixed.replace(link.tag, tag);
  }
  return { problems, fixed };
}

if (import.meta.main) {
  const root = new URL('../', import.meta.url);
  const pagePath = new URL('index.html', root);
  const html = await Deno.readTextFile(pagePath);
  const { problems, fixed } = await checkPage(html, (href) => Deno.readFile(new URL(href, root)));
  const write = Deno.args.includes('--write');
  for (const p of problems) console.log(`${write ? 'fixed' : 'stale'}: ${p}`);
  if (write && fixed !== html) await Deno.writeTextFile(pagePath, fixed);
  if (!problems.length) console.log('All stylesheet integrity hashes are up to date.');
  else if (!write) Deno.exit(1);
}
