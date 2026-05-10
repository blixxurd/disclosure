// OCR pipeline for scanned PDFs and image-only docs.
//
//   pdftoppm -r N input.pdf /tmp/page          # rasterize each page
//   tesseract /tmp/page-1.png - -l eng         # OCR each page
//
// Per-page so we can report progress + handle large docs without spiking
// memory.
//
// Auto-tunes DPI by page count (heavy multi-page scans get 300 dpi for
// quality; small files stay at 150 dpi for speed) and falls back to a
// ghostscript pre-pass when pdftoppm chokes on the source PDF.

import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve as pathResolve } from 'node:path';
import { createLogger } from '@disclosure/shared/log';
import { runCmd } from './util.js';

const log = createLogger('-indexer');

export interface OcrResult {
  text: string;
  pagesOcrd: number;
  imageOnly: boolean;
  /** True when ghostscript was used to clean a malformed source PDF. */
  repaired?: boolean;
}

// Multi-page scans benefit from a higher dpi (FBI case files, Apollo debriefings)
// for cleaner OCR. 200 dpi is the practical sweet spot — 300 dpi quadruples
// rasterization time for the 200+ page FBI sections without enough accuracy
// gain to justify the wall-clock cost. 1-page rasterized PDFs (FBI photos,
// sketches) stay at 150 dpi.
function dpiFor(pageCount: number | null): string {
  if (pageCount != null && pageCount > 50) return '200';
  return '150';
}

// pdftoppm fails on a corrupted PDF — distinguishable from a slow / killed
// pdftoppm by the presence of poppler's syntax-error markers on stderr. Only
// fall back to ghostscript repair when we're sure poppler couldn't parse the
// file; never on a timeout (which would just re-time-out after gs).
function looksLikeParseError(stderr: string): boolean {
  return /Syntax Error|Catalog dictionary|Invalid PDF|missing/i.test(stderr);
}

// Rasterize the PDF and OCR every page. Falls back to a ghostscript clean-up
// pass if poppler's parser rejects the source — this rescues the malformed
// 2020 Mission Reports (D63/D64/D65) where pdftoppm errors out with parse
// errors but ghostscript renders fine.
export async function ocrPdf(
  path: string,
  opts: { pageCount?: number | null } = {},
): Promise<OcrResult | null> {
  const workdir = mkdtempSync(pathResolve(tmpdir(), 'disclosure-ocr-'));
  try {
    const dpi = dpiFor(opts.pageCount ?? null);
    const pngPrefix = pathResolve(workdir, 'page');

    // 60-minute pdftoppm timeout. At 200 dpi a 290-page FBI section
    // takes ~5-10 min; the wide margin handles outliers without false-killing.
    const RAST_TIMEOUT_MS = 60 * 60_000;
    let rast = await runCmd('pdftoppm', ['-r', dpi, '-png', path, pngPrefix], {
      timeoutMs: RAST_TIMEOUT_MS,
    });

    let repaired = false;

    if (rast.code !== 0) {
      // Distinguish corruption (syntax error → gs repair fixes it) from
      // timeout (would just time out again after gs repair).
      if (rast.code === 124 || !looksLikeParseError(rast.stderr)) {
        log.warn('pdftoppm failed (not a parse error; skipping gs repair)', {
          path,
          code: rast.code,
          stderr: rast.stderr.trim().slice(0, 200),
        });
        return null;
      }
      log.info('pdftoppm parse error; attempting ghostscript repair', {
        path,
        stderr: rast.stderr.trim().slice(0, 160),
      });
      const repairedPath = pathResolve(workdir, 'repaired.pdf');
      const gs = await runCmd(
        'gs',
        [
          '-q',
          '-dNOPAUSE',
          '-dBATCH',
          '-sDEVICE=pdfwrite',
          `-sOutputFile=${repairedPath}`,
          path,
        ],
        { timeoutMs: 5 * 60_000 },
      );
      if (gs.code !== 0) {
        log.warn('ghostscript repair failed', {
          path,
          code: gs.code,
          stderr: gs.stderr.trim().slice(0, 200),
        });
        return null;
      }
      repaired = true;
      rast = await runCmd('pdftoppm', ['-r', dpi, '-png', repairedPath, pngPrefix], {
        timeoutMs: RAST_TIMEOUT_MS,
      });
      if (rast.code !== 0) {
        log.warn('pdftoppm failed even after gs repair', {
          path,
          code: rast.code,
          stderr: rast.stderr.trim().slice(0, 200),
        });
        return null;
      }
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
    return { text: combined, pagesOcrd: pngs.length, imageOnly: false, repaired };
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
