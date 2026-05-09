import type { APIRequestContext } from 'playwright';
import { resolve, relative } from 'node:path';
import { atomicWrite, ensureDir, fileExistsWithSha256, sha256, urlFilename } from '@disclosure/shared/util';
import { DATA_ROOT, FILES_DIR } from '@disclosure/shared/config';
import type { Db, FileRow, ReleaseConfig } from '@disclosure/shared/db';
import { DOWNLOAD_TIMEOUT_MS } from './config.js';
import { resolveDvidsVideo } from './dvids.js';

export type DownloadOutcome =
  | { kind: 'verified'; bytes: 0 }              // already on disk with matching sha
  | { kind: 'not-modified'; bytes: 0 }          // server 304
  | { kind: 'downloaded'; bytes: number }       // got new bytes
  | { kind: 'failed'; bytes: 0; error: string };

export async function downloadFile(args: {
  request: APIRequestContext;
  db: Db;
  file: FileRow;
  release: ReleaseConfig;
}): Promise<DownloadOutcome> {
  const { request, db, file, release } = args;

  // Fast path: file exists on disk and its sha256 matches the recorded one.
  if (
    file.local_path &&
    file.sha256 &&
    fileExistsWithSha256(resolve(DATA_ROOT, file.local_path), file.sha256)
  ) {
    return { kind: 'verified', bytes: 0 };
  }

  // Resolve fetch URL + filename. For war.gov, source_url is already the bytes URL.
  // For DVIDS, source_url is the canonical video page; the mp4 URL is on CloudFront
  // and we cache it in resolved_url after the first lookup.
  let fetchUrl: string;
  let filename: string | null;

  if (file.source_system === 'dvids') {
    if (file.resolved_url) {
      fetchUrl = file.resolved_url;
      filename = urlFilename(fetchUrl);
    } else {
      const videoId = file.source_url.split('/').pop();
      if (!videoId) {
        db.setFileError(file.id, null, 'no DVIDS video id in source_url');
        return { kind: 'failed', bytes: 0, error: 'no DVIDS video id' };
      }
      try {
        const resolved = await resolveDvidsVideo(request, videoId);
        db.setFileResolvedUrl(file.id, resolved.mp4Url);
        fetchUrl = resolved.mp4Url;
        filename = resolved.filename;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        db.setFileError(file.id, null, `dvids resolve failed: ${msg}`);
        return { kind: 'failed', bytes: 0, error: msg };
      }
    }
  } else {
    fetchUrl = file.source_url;
    filename = urlFilename(file.source_url);
  }

  if (!filename) {
    db.setFileError(file.id, null, 'could not derive local filename');
    return { kind: 'failed', bytes: 0, error: 'could not derive local filename' };
  }
  const targetPath = localPathFor(release.slug, file.kind, filename);
  if (!targetPath) {
    db.setFileError(file.id, null, `unsupported kind: ${file.kind}`);
    return { kind: 'failed', bytes: 0, error: `unsupported kind: ${file.kind}` };
  }

  // Conditional GET — let the server tell us if it's unchanged.
  // war.gov/Akamai requires a Referer for thumbnails; CloudFront (DVIDS) doesn't care.
  const reqHeaders: Record<string, string> = {};
  if (file.source_system === 'war.gov') reqHeaders['Referer'] = release.sourceUrl;
  if (file.http_etag) reqHeaders['If-None-Match'] = file.http_etag;
  if (file.http_last_modified) reqHeaders['If-Modified-Since'] = file.http_last_modified;

  let resp;
  try {
    resp = await request.get(fetchUrl, {
      headers: reqHeaders,
      timeout: DOWNLOAD_TIMEOUT_MS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db.setFileError(file.id, null, msg);
    return { kind: 'failed', bytes: 0, error: msg };
  }

  const status = resp.status();

  if (status === 304) {
    db.setFileNotModified(file.id);
    return { kind: 'not-modified', bytes: 0 };
  }

  if (status !== 200) {
    const msg = `HTTP ${status}`;
    db.setFileError(file.id, status, msg);
    return { kind: 'failed', bytes: 0, error: msg };
  }

  let body: Buffer;
  try {
    body = await resp.body();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db.setFileError(file.id, status, `body read failed: ${msg}`);
    return { kind: 'failed', bytes: 0, error: msg };
  }

  const headers = resp.headers();
  const contentType = headers['content-type'] ?? null;
  const etag = headers['etag'] ?? null;
  const lastModified = headers['last-modified'] ?? null;
  const hash = sha256(body);

  ensureDir(resolve(targetPath, '..'));
  atomicWrite(targetPath, body);

  db.setFileSuccess({
    id: file.id,
    local_path: relative(DATA_ROOT, targetPath),
    size_bytes: body.byteLength,
    sha256: hash,
    content_type: contentType,
    http_status: status,
    http_etag: etag,
    http_last_modified: lastModified,
  });

  return { kind: 'downloaded', bytes: body.byteLength };
}

function localPathFor(releaseSlug: string, kind: string, filename: string): string | null {
  let subdir: string;
  switch (kind) {
    case 'pdf':       subdir = 'pdfs'; break;
    case 'image':     subdir = 'images'; break;
    case 'thumbnail': subdir = 'thumbnails'; break;
    case 'video':     subdir = 'videos'; break;
    default:          return null;
  }
  return resolve(FILES_DIR, releaseSlug, subdir, filename);
}

