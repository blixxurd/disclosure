import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

// Atomic write: write to {path}.partial, then rename. Renames within the same
// filesystem are atomic on POSIX; partial files survive crashes for cleanup.
export function atomicWrite(path: string, data: Buffer): void {
  ensureDir(dirname(path));
  const tmp = `${path}.partial`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

export function fileExistsWithSha256(path: string, expectedSha: string): boolean {
  if (!existsSync(path)) return false;
  const actual = sha256(readFileSync(path));
  return actual === expectedSha;
}

export function fileSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

// Filename slug from a URL. e.g.
//   https://www.war.gov/medialink/ufo/release_1/foo-bar.pdf  →  'foo-bar'
// Used for natural_key derivation.
export function urlSlug(url: string): string | null {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (!last) return null;
    return last.replace(/\.[a-zA-Z0-9]+$/, '').toLowerCase();
  } catch {
    return null;
  }
}

// Filename including extension, lowercased — for on-disk path.
export function urlFilename(url: string): string | null {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? last.toLowerCase() : null;
  } catch {
    return null;
  }
}
