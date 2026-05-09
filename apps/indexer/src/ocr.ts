// OCR pipeline for scanned PDFs and image-only docs.
//
//   pdftoppm -r 200 input.pdf /tmp/page          # rasterize each page
//   tesseract /tmp/page-1.png - -l eng           # OCR each page
//
// We do this per-page so we can report progress + handle large docs
// without spiking memory.

import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve as pathResolve } from 'node:path';
import { runCmd } from './util.js';
import { log } from './log.js';

export interface OcrResult {
  text: string;
  pagesOcrd: number;
  imageOnly: boolean;
}

// Rasterize the PDF at 200dpi and OCR every page. Returns concatenated text.
// Returns null on hard failure.
export async function ocrPdf(path: string): Promise<OcrResult | null> {
  const workdir = mkdtempSync(pathResolve(tmpdir(), 'disclosure-ocr-'));
  try {
    // pdftoppm -r 150 -png path /workdir/page  →  page-1.png, page-2.png, ...
    // 150dpi is plenty for OCR while halving the byte count vs 200dpi.
    const rast = await runCmd('pdftoppm', ['-r', '150', '-png', path, pathResolve(workdir, 'page')], {
      timeoutMs: 30 * 60_000,
    });
    if (rast.code !== 0) {
      log.warn('pdftoppm failed', {
        path,
        code: rast.code,
        stderr: rast.stderr.trim().slice(0, 200),
      });
      return null;
    }

    const pngs = readdirSync(workdir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => pathResolve(workdir, f))
      .sort();

    if (pngs.length === 0) {
      log.warn('pdftoppm produced no pages', { path });
      return null;
    }

    let combined = '';
    for (const png of pngs) {
      const r = await runCmd('tesseract', [png, '-', '-l', 'eng'], {
        timeoutMs: 60_000,
      });
      if (r.code !== 0) {
        log.warn('tesseract failed on page', {
          page: png,
          code: r.code,
          stderr: r.stderr.trim().slice(0, 200),
        });
        continue;
      }
      combined += r.stdout + '\n';
    }
    return { text: combined, pagesOcrd: pngs.length, imageOnly: false };
  } finally {
    try {
      rmSync(workdir, { recursive: true, force: true });
    } catch {
      /* ignore tmp cleanup errors */
    }
  }
}

// OCR a single image file (PNG/JPG) directly with tesseract.
export async function ocrImage(path: string): Promise<string | null> {
  const r = await runCmd('tesseract', [path, '-', '-l', 'eng'], { timeoutMs: 60_000 });
  if (r.code !== 0) {
    log.warn('tesseract image OCR failed', { path, code: r.code });
    return null;
  }
  return r.stdout;
}
