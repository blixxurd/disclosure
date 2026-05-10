#!/usr/bin/env node
// Renders a markdown file (e.g. analysis/release-01.md) to a self-contained
// mobile-first HTML file with embedded CSS. No external assets — the output
// works offline and reads cleanly on phones.
//
//   node scripts/render-html.mjs <input.md> [output.html]
//
// If output is omitted, the input filename is reused with .html extension.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node scripts/render-html.mjs <input.md> [output.html]');
  process.exit(2);
}

const inputPath = resolve(repoRoot, args[0]);
const outputPath =
  args[1] !== undefined
    ? resolve(repoRoot, args[1])
    : resolve(dirname(inputPath), basename(inputPath, extname(inputPath)) + '.html');

const md = readFileSync(inputPath, 'utf8');

// Pull the first H1 from the document for the <title>; fallback to filename.
const titleMatch = /^#\s+(.+)$/m.exec(md);
const docTitle = titleMatch ? titleMatch[1].trim() : basename(inputPath);

const marked = new Marked({ gfm: true, breaks: false });
const bodyHtml = await marked.parse(md);

const STYLES = `
:root {
  color-scheme: light dark;
  --bg: #fefefe;
  --fg: #1a1a1a;
  --muted: #5a5a5a;
  --rule: #e2e2e2;
  --quote-bg: #f4f3ee;
  --quote-bar: #c8b88a;
  --code-bg: #f3f3f3;
  --link: #0a58ca;
  --tag-strong: #1a4d2e;
  --tag-suggestive: #7a4f01;
  --tag-open: #5a5a5a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16161a;
    --fg: #e5e5e5;
    --muted: #9a9a9a;
    --rule: #2d2d33;
    --quote-bg: #1f1f23;
    --quote-bar: #c8b88a;
    --code-bg: #232328;
    --link: #74b1ff;
    --tag-strong: #6fbe92;
    --tag-suggestive: #d6a456;
    --tag-open: #a0a0a0;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  background: var(--bg);
  color: var(--fg);
  font: 17px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  margin: 0;
  padding: 0;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
main {
  max-width: 700px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}
@media (min-width: 700px) {
  main { padding: 3rem 2rem 5rem; }
}
h1, h2, h3, h4 {
  line-height: 1.25;
  margin: 2.2em 0 0.7em;
  font-weight: 700;
}
h1 {
  font-size: 1.95rem;
  letter-spacing: -0.01em;
  margin-top: 0;
}
h2 {
  font-size: 1.45rem;
  border-top: 1px solid var(--rule);
  padding-top: 1.6em;
}
h3 { font-size: 1.18rem; }
h4 { font-size: 1.02rem; color: var(--muted); }
p { margin: 1em 0; }
a { color: var(--link); }
strong { font-weight: 700; }
em { font-style: italic; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 2.5em 0; }
ul, ol { padding-left: 1.4em; }
li { margin: 0.35em 0; }
blockquote {
  margin: 1.5em 0;
  padding: 0.9em 1.1em;
  border-left: 4px solid var(--quote-bar);
  background: var(--quote-bg);
  border-radius: 4px;
  font-style: italic;
  color: var(--fg);
}
blockquote p { margin: 0.5em 0; }
blockquote p:first-child { margin-top: 0; }
blockquote p:last-child { margin-bottom: 0; }
code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.92em;
  background: var(--code-bg);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
pre {
  background: var(--code-bg);
  padding: 0.9em 1.1em;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.88em;
  line-height: 1.55;
}
pre code {
  background: transparent;
  padding: 0;
  border-radius: 0;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1.5em 0;
  font-size: 0.94em;
}
.table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 1.5em -1.25em; padding: 0 1.25em; }
.table-wrap table { margin: 0; min-width: 100%; }
th, td {
  border: 1px solid var(--rule);
  padding: 0.55em 0.8em;
  text-align: left;
  vertical-align: top;
}
th { font-weight: 600; background: var(--code-bg); }
/* Strong / Suggestive / Open tag styling — tinted bold text inline */
strong:where(:not(table strong)) {
  /* Default strong */
}
/* Recognize the **Strong.** / **Suggestive.** / **Open.** convention */
p strong:first-child { /* no-op, keep markup-driven */ }
.byline {
  color: var(--muted);
  font-size: 0.95em;
  margin-top: -0.5em;
}
hr + p em:first-child {
  color: var(--muted);
}
/* Print niceties */
@media print {
  main { max-width: 100%; padding: 0; }
  blockquote { background: transparent; border-left: 2px solid #888; }
}
`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${escapeHtml(docTitle)}</title>
  <meta name="color-scheme" content="light dark">
  <style>${STYLES}</style>
</head>
<body>
  <main>
${wrapTables(bodyHtml)}
  </main>
</body>
</html>
`;

writeFileSync(outputPath, html);
console.log(`wrote ${outputPath}`);

// ── helpers ────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Wrap each <table> in a horizontally-scrollable container so wide tables
// stay readable on narrow screens without breaking the page layout.
function wrapTables(html) {
  return html.replace(
    /<table([\s\S]*?)<\/table>/g,
    (m) => `<div class="table-wrap">${m}</div>`,
  );
}
