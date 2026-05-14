// Memoized Db handle. Astro can call this from build-time getStaticPaths,
// from server endpoints, and from page render code. We open the SQLite file
// once and reuse the connection across the process lifetime.
import { Db } from '@disclosure/shared/db';
import type { Logger } from '@disclosure/shared/log';

const silentLog: Logger = {
  info: () => {},
  warn: (m: string, fields?: Record<string, unknown>) => console.warn(m, fields),
  error: (m: string, fields?: Record<string, unknown>) => console.error(m, fields),
  debug: () => {},
};

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) _db = new Db({ log: silentLog });
  return _db;
}
