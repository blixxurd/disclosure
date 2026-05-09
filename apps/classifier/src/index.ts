#!/usr/bin/env node
import { createLogger } from '@disclosure/shared/log';
import { runOnce, type RunOptions } from './run.js';

const log = createLogger('-classifier');

function parseArgs(argv: string[]): RunOptions {
  const opts: RunOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    if (a === '--force') opts.force = true;
    else if (a === '--record') {
      const n = parseInt(argv[++i] ?? '', 10);
      if (Number.isFinite(n)) opts.onlyRecord = n;
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
  process.stdout.write(`disclosure-classify

Walks the indexed corpus, applies keyword + metadata rules, and writes a
classification (tier + themes + findings) to user_record_meta for each
record. Records with user_overridden=true in their existing classification
are skipped unless --force is passed.

Usage:
  disclosure-classify [options]

Options:
  --force            Overwrite even user-overridden classifications.
  --record <id>      Only classify a specific record id (debug).
  -h, --help         Show this help.
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
