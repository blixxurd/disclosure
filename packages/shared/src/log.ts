// Shared structured logger. Writes one human line to stderr, one JSON line to a
// daily log file under data/logs/. Each app calls `createLogger('-suffix')` so
// downloader/indexer/classifier each get their own daily file.
import { mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOGS_DIR } from './config.js';

type Level = 'info' | 'warn' | 'error' | 'debug';

export interface Logger {
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
  debug: (msg: string, fields?: Record<string, unknown>) => void;
}

export function createLogger(suffix = ''): Logger {
  let logFilePath: string | null = null;
  function ensureLogFile(): string {
    if (logFilePath) return logFilePath;
    mkdirSync(LOGS_DIR, { recursive: true });
    const ymd = new Date().toISOString().slice(0, 10);
    logFilePath = resolve(LOGS_DIR, `${ymd}${suffix}.log`);
    return logFilePath;
  }

  function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
    const ts = new Date().toISOString();
    const human = fields
      ? `[${ts}] ${level.toUpperCase()} ${msg} ${JSON.stringify(fields)}`
      : `[${ts}] ${level.toUpperCase()} ${msg}`;
    process.stderr.write(human + '\n');
    try {
      appendFileSync(
        ensureLogFile(),
        JSON.stringify({ ts, level, msg, ...(fields ?? {}) }) + '\n',
      );
    } catch {
      // Don't crash on log file errors.
    }
  }

  return {
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    debug: (msg, fields) => emit('debug', msg, fields),
  };
}
