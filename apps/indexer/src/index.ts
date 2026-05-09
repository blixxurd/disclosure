#!/usr/bin/env node
import { createLogger } from '@disclosure/shared/log';
import { runOnce, type RunOptions } from './run.js';

const log = createLogger('-indexer');

function parseArgs(argv: string[]): RunOptions {
  const opts: RunOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    if (a === '--limit') {
      const n = parseInt(argv[++i] ?? '', 10);
      if (Number.isFinite(n) && n > 0) opts.fileLimit = n;
    } else if (a === '--kind') {
      const k = argv[++i];
      if (k) opts.kinds = [...(opts.kinds ?? []), k];
    } else if (a === '--force') {
      opts.force = true;
    } else if (a === '--ocr') {
      opts.ocr = true;
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else {
      log.warn('unknown argument', { arg: a });
    }
  }
  return opts;
}

function printHelp(): void {
  process.stdout.write(`disclosure-index

Walks the disclosure SQLite database and extracts metadata + searchable text
from every downloaded file. Decrypts soft-encrypted gov PDFs in place.

Usage:
  disclosure-index [options]

Options:
  --limit <n>          Only process the first N files (smoke testing).
  --kind <k>           Restrict to a kind: pdf | image | thumbnail | video. Repeatable.
  --ocr                Run tesseract OCR on scanned PDFs (slow; ~2-3s per page).
  --force              Re-extract even if metadata already exists.
  -h, --help           Show this help.
`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  await runOnce(opts);
}

main().catch((e) => {
  log.error('fatal', { error: e instanceof Error ? e.message : String(e) });
  process.exitCode = 1;
});
