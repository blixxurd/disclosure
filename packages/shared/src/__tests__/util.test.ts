import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  sha256,
  ensureDir,
  atomicWrite,
  fileExistsWithSha256,
  sha256OfFile,
  sizeOfFile,
  nowIso,
  urlSlug,
  urlFilename,
} from '../util.js';

describe('sha256', () => {
  it('hashes a known string to its known digest', () => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('produces stable output', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });
  it('handles Buffer input', () => {
    expect(sha256(Buffer.from('abc'))).toBe(sha256('abc'));
  });
});

describe('urlSlug', () => {
  it('strips extension and lowercases', () => {
    expect(urlSlug('https://example.com/path/Foo-Bar.PDF')).toBe('foo-bar');
  });
  it('handles literal commas in path (gov uses these)', () => {
    expect(urlSlug('https://x.gov/dow-uap-d32,-syria-october-2024.pdf')).toBe(
      'dow-uap-d32,-syria-october-2024',
    );
  });
  it('returns null for invalid URL', () => {
    expect(urlSlug('not a url')).toBeNull();
  });
  it('returns null when path has no terminal segment', () => {
    expect(urlSlug('https://example.com/')).toBeNull();
  });
});

describe('urlFilename', () => {
  it('returns lowercased filename with extension', () => {
    expect(urlFilename('https://x.com/path/FILE.PDF')).toBe('file.pdf');
  });
  it('returns null for invalid URL', () => {
    expect(urlFilename('::not://a/url')).toBeNull();
  });
});

describe('atomicWrite + roundtrip', () => {
  it('writes a file via temp partial then atomic rename', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'disclosure-test-'));
    try {
      const path = resolve(dir, 'sub', 'out.txt');
      atomicWrite(path, Buffer.from('hello world'));
      expect(existsSync(path)).toBe(true);
      expect(existsSync(`${path}.partial`)).toBe(false);
      expect(readFileSync(path, 'utf8')).toBe('hello world');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('overwrites existing file', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'disclosure-test-'));
    try {
      const path = resolve(dir, 'out.txt');
      atomicWrite(path, Buffer.from('first'));
      atomicWrite(path, Buffer.from('second'));
      expect(readFileSync(path, 'utf8')).toBe('second');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('fileExistsWithSha256 / sha256OfFile / sizeOfFile', () => {
  it('matches when sha is correct, fails when wrong', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'disclosure-test-'));
    try {
      const path = resolve(dir, 'file.bin');
      atomicWrite(path, Buffer.from('hello'));
      const expectedSha = sha256OfFile(path);
      expect(fileExistsWithSha256(path, expectedSha)).toBe(true);
      expect(fileExistsWithSha256(path, '0'.repeat(64))).toBe(false);
      expect(sizeOfFile(path)).toBe(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns false for missing file', () => {
    expect(fileExistsWithSha256('/nope/does/not/exist', '0'.repeat(64))).toBe(false);
  });
});

describe('ensureDir', () => {
  it('creates nested directories without error', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'disclosure-test-'));
    try {
      const nested = resolve(dir, 'a', 'b', 'c');
      ensureDir(nested);
      expect(existsSync(nested)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is idempotent', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'disclosure-test-'));
    try {
      ensureDir(dir);
      expect(() => ensureDir(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('nowIso', () => {
  it('returns an ISO 8601 timestamp', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
