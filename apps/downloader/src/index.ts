#!/usr/bin/env node
import { createLogger } from '@disclosure/shared/log';
import { runOnce, type RunOptions } from './run.js';

const log = createLogger('');

function parseArgs(argv: string[]): RunOptions {
  const opts: RunOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue; // pnpm forwards a lone `--` separator
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--limit') {
      const n = parseInt(argv[++i] ?? '', 10);
      if (Number.isFinite(n) && n > 0) opts.fileLimit = n;
    } else if (a === '--release') {
      const slug = argv[++i];
      if (slug) opts.releaseSlugs = [...(opts.releaseSlugs ?? []), slug];
    } else if (a === '--source') {
      const sys = argv[++i];
      if (sys === 'war.gov' || sys === 'dvids') {
        opts.sourceSystems = [...(opts.sourceSystems ?? []), sys];
      } else {
        log.warn('unknown --source value (expected war.gov | dvids)', { value: sys });
      }
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
  process.stdout.write(`disclosure-download

Mirrors war.gov/UFO/ to the local /data/ directory.

Usage:
  disclosure-download [options]

Options:
  --dry-run               Sync the manifest into the DB but skip downloading files.
  --limit <n>             Only attempt the first N files (smoke testing).
  --release <slug>        Restrict to a single release (e.g. "release_1"). Repeatable.
  --source <sys>          Restrict downloads to a source system: war.gov | dvids. Repeatable.
  -h, --help              Show this help.
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
