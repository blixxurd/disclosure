// PDF-specific extractors: pdfinfo (metadata), qpdf (decrypt), pdftotext (text).
// These all live as system binaries — installed via Homebrew typically.
//
// pdfinfo output is line-based "Field: value" pairs. We parse the ones we
// care about and stash the raw output too.

import { renameSync, unlinkSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { runCmd, sha256OfFile, sizeOfFile } from './util.js';
import { log } from './log.js';

export interface PdfInfo {
  pages: number | null;
  title: string | null;
  subject: string | null;
  author: string | null;
  creator: string | null;
  producer: string | null;
  createdAt: string | null;     // ISO if parseable, else original string
  modifiedAt: string | null;
  encrypted: boolean;
  permissions: string | null;   // raw permissions string
  permissionsAllowCopy: boolean;
  permissionsAllowPrint: boolean;
  raw: Record<string, string>;  // every line, for forward-compat
}

export async function pdfInfo(path: string): Promise<PdfInfo | null> {
  // Use -enc UTF-8 so non-ASCII titles parse cleanly.
  const r = await runCmd('pdfinfo', ['-enc', 'UTF-8', path], { timeoutMs: 30_000 });
  if (r.code !== 0) {
    log.warn('pdfinfo failed', { path, code: r.code, stderr: r.stderr.trim().slice(0, 200) });
    return null;
  }
  const raw: Record<string, string> = {};
  for (const line of r.stdout.split('\n')) {
    const m = /^([^:]+):\s+(.*)$/.exec(line);
    if (!m) continue;
    raw[m[1]!.trim()] = m[2]!.trim();
  }
  const encrypted = (raw['Encrypted'] ?? 'no').startsWith('yes');
  let permissions: string | null = null;
  let allowCopy = !encrypted;
  let allowPrint = !encrypted;
  if (encrypted) {
    // pdfinfo prints e.g. "yes (print:yes copy:no change:no addNotes:yes algorithm:AES-256)"
    const m = /\((.*)\)/.exec(raw['Encrypted']!);
    if (m) {
      permissions = m[1]!;
      allowCopy = /copy:yes/.test(permissions);
      allowPrint = /print:yes/.test(permissions);
    }
  }
  return {
    pages: raw['Pages'] ? parseInt(raw['Pages'], 10) : null,
    title: raw['Title'] ?? null,
    subject: raw['Subject'] ?? null,
    author: raw['Author'] ?? null,
    creator: raw['Creator'] ?? null,
    producer: raw['Producer'] ?? null,
    createdAt: raw['CreationDate'] ?? null,
    modifiedAt: raw['ModDate'] ?? null,
    encrypted,
    permissions,
    permissionsAllowCopy: allowCopy,
    permissionsAllowPrint: allowPrint,
    raw,
  };
}

export interface DecryptResult {
  preDecryptSha256: string;
  newSha256: string;
  newSizeBytes: number;
}

// Decrypts an encrypted PDF in place using qpdf. The original gov sha256 is
// captured before the rewrite (caller persists it as pre_decrypt_sha256).
// Atomic-renames the decrypted output over the original to avoid leaving a
// half-written file on crash.
export async function decryptPdfInPlace(path: string): Promise<DecryptResult | null> {
  const preSha = sha256OfFile(path);
  const tmp = `${path}.decrypted`;
  // --decrypt with no password works for "soft" encryption (no user password,
  // only owner-perm restrictions). "Real" password-protected PDFs would fail
  // and we'd skip them.
  const r = await runCmd('qpdf', ['--decrypt', path, tmp], { timeoutMs: 120_000 });
  if (r.code !== 0) {
    log.warn('qpdf decrypt failed', {
      path,
      code: r.code,
      stderr: r.stderr.trim().slice(0, 200),
    });
    try { unlinkSync(tmp); } catch { /* ignore */ }
    return null;
  }
  renameSync(tmp, path);
  return {
    preDecryptSha256: preSha,
    newSha256: sha256OfFile(path),
    newSizeBytes: sizeOfFile(path),
  };
}

export interface PdfTextResult {
  text: string;
  source: 'pdf-text-layer' | 'tesseract-ocr';
}

// Extracts the embedded text layer with pdftotext. Fast and faithful when
// a real text layer exists.
export async function extractPdfText(path: string): Promise<string | null> {
  const r = await runCmd('pdftotext', ['-enc', 'UTF-8', '-layout', path, '-'], {
    timeoutMs: 60_000,
  });
  if (r.code !== 0) {
    log.warn('pdftotext failed', { path, code: r.code, stderr: r.stderr.trim().slice(0, 200) });
    return null;
  }
  return r.stdout;
}

// "Is this PDF a scan?" — heuristic on chars/page from the existing text
// layer. Real scanned PDFs land below ~10 chars/page (often 0). OCR'd PDFs
// (Apollo docs) land in the hundreds. Real born-digital PDFs are far higher.
export function looksLikeScan(text: string, pages: number | null): boolean {
  if (!pages || pages < 1) return false;
  const chars = text.replace(/\s+/g, '').length;
  return chars / pages < 10;
}
