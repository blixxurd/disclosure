import { resolve } from 'node:path';
import pLimit from 'p-limit';
import { Db, type FileRow, type FileMetadataInput } from '@disclosure/shared/db';
import { DATA_ROOT } from '@disclosure/shared/config';
import { createLogger } from '@disclosure/shared/log';
import {
  pdfInfo,
  decryptPdfInPlace,
  extractPdfText,
  looksLikeScan,
  repairPdfWithGhostscript,
} from './pdf.js';
import { ocrPdf } from './ocr.js';
import { readExif, shutdownExif, pickSharedFields } from './exif.js';

const log = createLogger('-indexer');
const EXTRACTOR_VERSION = 'indexer/0.1.0';

export interface RunOptions {
  /** Cap how many files we process (smoke testing). */
  fileLimit?: number;
  /** Restrict to one or more file kinds. */
  kinds?: string[];
  /** Re-extract metadata even if a row already exists. */
  force?: boolean;
  /** Run tesseract OCR on PDFs that have no text layer. Slow — opt-in. */
  ocr?: boolean;
}

export async function runOnce(opts: RunOptions = {}): Promise<void> {
  const db = new Db();
  let allFiles = db.listDownloadedFiles();
  if (opts.kinds && opts.kinds.length > 0) {
    allFiles = allFiles.filter((f) => opts.kinds!.includes(f.kind));
  }
  const files = opts.fileLimit ? allFiles.slice(0, opts.fileLimit) : allFiles;

  log.info('starting index', {
    total: files.length,
    kinds: opts.kinds ?? 'all',
    ocr: opts.ocr === true,
  });

  // PDFs are slow (decrypt + ocr); thumbnails/images/videos are fast metadata-only.
  // OCR pass benefits from more parallelism since tesseract is single-threaded.
  const pdfLimit = pLimit(opts.ocr ? 4 : 2);
  const otherLimit = pLimit(4);

  let done = 0;
  let metadata_ok = 0;
  let text_ok = 0;
  let decrypted = 0;
  let skipped_fresh = 0;
  let failed = 0;

  const tasks = files.map((file) => {
    const limit = file.kind === 'pdf' ? pdfLimit : otherLimit;
    return limit(async () => {
      try {
        const result = await indexOne({ db, file, opts });
        if (result.skipped) skipped_fresh++;
        if (result.metadataWritten) metadata_ok++;
        if (result.textWritten) text_ok++;
        if (result.decrypted) decrypted++;
      } catch (e) {
        failed++;
        log.warn('index failed', {
          file_id: file.id,
          path: file.local_path,
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        done++;
        if (done % 10 === 0 || done === files.length) {
          log.info('index progress', { done, total: files.length });
        }
      }
    });
  });

  await Promise.all(tasks);
  await shutdownExif();
  db.close();

  log.info('index complete', {
    total: files.length,
    metadata_ok,
    text_ok,
    decrypted,
    skipped_fresh,
    failed,
  });
}

interface IndexResult {
  metadataWritten: boolean;
  textWritten: boolean;
  decrypted: boolean;
  skipped: boolean;
}

async function indexOne(args: {
  db: Db;
  file: FileRow;
  opts: RunOptions;
}): Promise<IndexResult> {
  const { db, file, opts } = args;

  // Skip-if-fresh: re-running on the full corpus shouldn't re-OCR every scan
  // when nothing's changed. Bypass with --force.
  if (!opts.force) {
    const status = db.getFileIndexStatus(file.id);
    const indexFresh =
      status.extracted_at != null &&
      file.fetched_at != null &&
      status.extracted_at >= file.fetched_at;
    if (indexFresh) {
      // Index is current. Only fall through if we owe OCR for a known scan
      // (and the user actually asked for OCR this run).
      const owesOcr =
        file.kind === 'pdf' &&
        status.pdf_is_scan === 1 &&
        opts.ocr === true &&
        !status.has_text;
      if (!owesOcr) {
        return { metadataWritten: false, textWritten: false, decrypted: false, skipped: true };
      }
    }
  }

  const path = resolve(DATA_ROOT, file.local_path!);
  let metadataInput: FileMetadataInput = blankMetadata(file.id);

  if (file.kind === 'pdf') {
    return await indexPdf({ db, file, path, base: metadataInput, ocr: opts.ocr === true });
  } else if (file.kind === 'image' || file.kind === 'thumbnail') {
    return await indexImage({ db, file, path, base: metadataInput });
  } else if (file.kind === 'video') {
    return await indexVideo({ db, file, path, base: metadataInput });
  }
  return { metadataWritten: false, textWritten: false, decrypted: false, skipped: false };
}

async function indexPdf(args: {
  db: Db;
  file: FileRow;
  path: string;
  base: FileMetadataInput;
  ocr: boolean;
}): Promise<IndexResult> {
  const { db, file, path, base, ocr } = args;

  // Some PDFs (D63/D64/D65 in Release 01) are malformed at the poppler
  // parse level — pdfinfo, pdftotext, pdftoppm all error out. Ghostscript's
  // parser is more permissive and re-renders them cleanly. When pdfInfo
  // fails on the original, repair via gs and use the repaired path for all
  // subsequent extraction. Decryption can't run on a repaired PDF (the gov
  // file's encryption is bypassed by the rewrite), but these specific files
  // aren't encrypted anyway.
  let workingPath = path;
  let info = await pdfInfo(workingPath);
  let repairCleanup: (() => void) | null = null;
  let repaired = false;

  try {
    if (!info) {
      const r = await repairPdfWithGhostscript(path);
      if (!r) {
        return { metadataWritten: false, textWritten: false, decrypted: false, skipped: false };
      }
      workingPath = r.path;
      repairCleanup = r.cleanup;
      repaired = true;
      info = await pdfInfo(workingPath);
      if (!info) {
        log.warn('pdfinfo failed even after gs repair', { file_id: file.id });
        return { metadataWritten: false, textWritten: false, decrypted: false, skipped: false };
      }
      log.info('repaired malformed PDF via ghostscript', { file_id: file.id });
    }

    // Decrypt if soft-encrypted with print allowed. Skip when working off a
    // ghostscript-repaired file — that rewrite already strips encryption.
    let decrypted = false;
    if (
      !repaired &&
      info.encrypted &&
      info.permissionsAllowPrint &&
      !info.permissionsAllowCopy
    ) {
      log.debug('decrypting PDF', { file_id: file.id, path: workingPath });
      const dr = await decryptPdfInPlace(workingPath);
      if (dr) {
        db.setFilePostDecrypt({
          id: file.id,
          pre_decrypt_sha256: dr.preDecryptSha256,
          new_sha256: dr.newSha256,
          new_size_bytes: dr.newSizeBytes,
        });
        decrypted = true;
        info = (await pdfInfo(workingPath)) ?? info;
      }
    }

    // Try the embedded text layer first.
    let extractedText: string | null = null;
    let textSource: 'pdf-text-layer' | 'tesseract-ocr' | null = null;
    const layerText = await extractPdfText(workingPath);
    const isScan = layerText !== null && looksLikeScan(layerText, info.pages);
    if (layerText !== null && !isScan) {
      extractedText = layerText;
      textSource = 'pdf-text-layer';
    } else if (ocr) {
      log.debug('running OCR on PDF', { file_id: file.id, pages: info.pages });
      const result = await ocrPdf(workingPath, { pageCount: info.pages });
      if (result) {
        extractedText = result.text;
        textSource = 'tesseract-ocr';
      }
    } else {
      log.debug('skipping OCR (run with --ocr to extract scanned text)', {
        file_id: file.id,
        pages: info.pages,
      });
    }

    // exiftool runs on the original (gov-shipped) bytes so it can read XMP
    // even when we needed gs-repair to extract pdfinfo. For non-repaired
    // files this is just `path` unchanged.
    const tags = await readExif(path);
    const shared = tags ? pickSharedFields(tags) : blankShared();

    const md: FileMetadataInput = {
      ...base,
      format: 'application/pdf',
      pdf_pages: info.pages,
      pdf_creator: info.creator,
      pdf_producer: info.producer,
      pdf_title: info.title,
      pdf_author: info.author,
      pdf_created_at: info.createdAt,
      pdf_modified_at: info.modifiedAt,
      pdf_encrypted: info.encrypted ? 1 : 0,
      pdf_permissions: info.permissions,
      pdf_is_scan: isScan ? 1 : 0,
      width: shared.width,
      height: shared.height,
      exif_make: shared.exif_make,
      exif_model: shared.exif_model,
      exif_software: shared.exif_software,
      exif_taken_at: shared.exif_taken_at,
      gps_latitude: shared.gps_latitude,
      gps_longitude: shared.gps_longitude,
      gps_altitude: shared.gps_altitude,
      raw_metadata_json: tags ? JSON.stringify(tags) : JSON.stringify(info.raw),
    };
    db.upsertFileMetadata(md);

    let textWritten = false;
    if (extractedText !== null && textSource !== null && extractedText.trim().length > 0) {
      db.upsertFileText({
        file_id: file.id,
        text: extractedText,
        source: textSource,
      });
      textWritten = true;
    }

    return { metadataWritten: true, textWritten, decrypted, skipped: false };
  } finally {
    repairCleanup?.();
  }
}

async function indexImage(args: {
  db: Db;
  file: FileRow;
  path: string;
  base: FileMetadataInput;
}): Promise<IndexResult> {
  const { db, file, path, base } = args;
  const tags = await readExif(path);
  if (!tags) {
    return { metadataWritten: false, textWritten: false, decrypted: false, skipped: false };
  }
  const shared = pickSharedFields(tags);
  const format = inferImageFormat(path, tags);
  db.upsertFileMetadata({
    ...base,
    format,
    width: shared.width,
    height: shared.height,
    exif_make: shared.exif_make,
    exif_model: shared.exif_model,
    exif_software: shared.exif_software,
    exif_taken_at: shared.exif_taken_at,
    gps_latitude: shared.gps_latitude,
    gps_longitude: shared.gps_longitude,
    gps_altitude: shared.gps_altitude,
    raw_metadata_json: JSON.stringify(tags),
  });
  return { metadataWritten: true, textWritten: false, decrypted: false, skipped: false };
}

async function indexVideo(args: {
  db: Db;
  file: FileRow;
  path: string;
  base: FileMetadataInput;
}): Promise<IndexResult> {
  const { db, file, path, base } = args;
  const tags = await readExif(path);
  if (!tags) {
    return { metadataWritten: false, textWritten: false, decrypted: false, skipped: false };
  }
  const shared = pickSharedFields(tags);
  db.upsertFileMetadata({
    ...base,
    format: 'video/mp4',
    width: shared.width,
    height: shared.height,
    exif_make: shared.exif_make,
    exif_model: shared.exif_model,
    exif_software: shared.exif_software,
    exif_taken_at: shared.exif_taken_at,
    gps_latitude: shared.gps_latitude,
    gps_longitude: shared.gps_longitude,
    gps_altitude: shared.gps_altitude,
    duration_seconds: shared.duration_seconds,
    video_codec: shared.video_codec,
    video_bitrate: shared.video_bitrate,
    video_fps: shared.video_fps,
    video_frames: shared.video_frames,
    audio_codec: shared.audio_codec,
    audio_channels: shared.audio_channels,
    raw_metadata_json: JSON.stringify(tags),
  });
  return { metadataWritten: true, textWritten: false, decrypted: false, skipped: false };
}

function blankShared() {
  return {
    width: null,
    height: null,
    exif_make: null,
    exif_model: null,
    exif_software: null,
    exif_taken_at: null,
    gps_latitude: null,
    gps_longitude: null,
    gps_altitude: null,
    duration_seconds: null,
    video_codec: null,
    video_bitrate: null,
    video_fps: null,
    video_frames: null,
    audio_codec: null,
    audio_channels: null,
  };
}

function blankMetadata(fileId: number): FileMetadataInput {
  return {
    file_id: fileId,
    format: null,
    pdf_pages: null,
    pdf_creator: null,
    pdf_producer: null,
    pdf_title: null,
    pdf_author: null,
    pdf_created_at: null,
    pdf_modified_at: null,
    pdf_encrypted: null,
    pdf_permissions: null,
    pdf_is_scan: null,
    ...blankShared(),
    raw_metadata_json: null,
    extractor_version: EXTRACTOR_VERSION,
  };
}

function inferImageFormat(path: string, tags: unknown): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  const t = tags as { MIMEType?: unknown };
  return typeof t.MIMEType === 'string' ? t.MIMEType : null;
}
