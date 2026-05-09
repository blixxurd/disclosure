import { mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../../..');
const LOGS_DIR = resolve(REPO_ROOT, 'data/logs');

let logFilePath: string | null = null;
function ensureLogFile(): string {
  if (logFilePath) return logFilePath;
  mkdirSync(LOGS_DIR, { recursive: true });
  const ymd = new Date().toISOString().slice(0, 10);
  logFilePath = resolve(LOGS_DIR, `${ymd}-classifier.log`);
  return logFilePath;
}

type Level = 'info' | 'warn' | 'error' | 'debug';
function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const human = fields
    ? `[${ts}] ${level.toUpperCase()} ${msg} ${JSON.stringify(fields)}`
    : `[${ts}] ${level.toUpperCase()} ${msg}`;
  process.stderr.write(human + '\n');
  try {
    appendFileSync(ensureLogFile(), JSON.stringify({ ts, level, msg, ...(fields ?? {}) }) + '\n');
  } catch {
    /* swallow */
  }
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
};
