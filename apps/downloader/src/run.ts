import { writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import pLimit from 'p-limit';
import { Db, type RunCounts, type ReleaseConfig, type ReleaseRow } from '@disclosure/shared/db';
import { DATA_ROOT, MANIFESTS_DIR } from '@disclosure/shared/config';
import { ensureDir, nowIso } from '@disclosure/shared/util';
import { createLogger } from '@disclosure/shared/log';
import { openBrowser } from './browser.js';
import { fetchManifest, parseManifest, type ParsedRecord } from './manifest.js';
import { downloadFile } from './download.js';
import { DOWNLOAD_CONCURRENCY } from './config.js';
import {
  MANIFEST_URL,
  SOURCE_URL,
  allKnownReleaseConfigs,
  inferReleaseFromDate,
} from './release-map.js';

const log = createLogger('');

export interface RunOptions {
  /** Skip downloads — only sync the manifest into the DB. */
  dryRun?: boolean;
  /** Cap how many files we attempt to download (smoke testing). */
  fileLimit?: number;
  /** Restrict to releases by slug. Default: all. */
  releaseSlugs?: string[];
  /** Restrict download pass to one or more source systems (e.g. 'dvids'). */
  sourceSystems?: ('war.gov' | 'dvids')[];
}

export async function runOnce(opts: RunOptions = {}): Promise<void> {
  const db = new Db();
  const runId = db.startRun();
  const counts: RunCounts = {
    records_added: 0,
    records_updated: 0,
    records_removed: 0,
    files_added: 0,
    files_updated: 0,
    files_failed: 0,
  };

  const session = await openBrowser(SOURCE_URL);

  try {
    await processManifest({ db, session, opts, counts });

    if (!opts.dryRun) {
      await downloadAllPending({ db, session, counts, opts });
    }

    db.finishRun(runId, 'success', counts);
    log.info('run complete', { runId, ...counts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db.finishRun(runId, 'failed', counts, msg);
    log.error('run failed', { runId, error: msg, ...counts });
    throw e;
  } finally {
    await session.close();
    db.close();
  }
}

// One merged CSV → many releases. Fetch once, parse once, then per-release
// upsert + tombstone. Each ParsedRecord already knows its own release_slug
// (via release-map.ts inference on the Release Date column).
async function processManifest(args: {
  db: Db;
  session: { request: import('playwright').APIRequestContext };
  opts: RunOptions;
  counts: RunCounts;
}): Promise<void> {
  const { db, session, opts, counts } = args;

  log.info('fetching merged manifest', { url: MANIFEST_URL });
  const manifest = await fetchManifest(session.request, MANIFEST_URL);
  log.info('manifest fetched', {
    bytes: manifest.byte_size,
    sha: manifest.content_sha256.slice(0, 12),
  });

  // Compare to last snapshot. If unchanged AND no release filter is active,
  // skip parse + upsert entirely. (With a filter, we still want to run so the
  // operator can re-process a single release on demand.)
  const last = db.findLatestManifestSnapshot();
  const filterActive = (opts.releaseSlugs?.length ?? 0) > 0;
  if (last && last.content_sha256 === manifest.content_sha256 && !filterActive) {
    log.info('manifest unchanged since last run; skipping ingest');
    return;
  }

  const records = parseManifest(manifest.bytes.toString('utf8'));
  log.info('parsed records', { count: records.length });

  // Filter by release if requested.
  const filterSet = new Set(opts.releaseSlugs ?? []);
  const inScope = filterActive
    ? records.filter((r) => filterSet.has(r.release_slug))
    : records;
  if (filterActive) {
    log.info('release filter active', {
      slugs: [...filterSet],
      before: records.length,
      after: inScope.length,
    });
  }

  // Group records by release_slug so we can upsert per-release rows and
  // tombstone per-release.
  const byRelease = new Map<string, ParsedRecord[]>();
  for (const r of inScope) {
    if (!byRelease.has(r.release_slug)) byRelease.set(r.release_slug, []);
    byRelease.get(r.release_slug)!.push(r);
  }
  const releasesSeen = [...byRelease.keys()];

  // Snapshot raw bytes once (global, not per-release).
  const ts = nowIso().replace(/[:.]/g, '-');
  const snapshotPath = resolve(MANIFESTS_DIR, `${ts}.csv`);
  ensureDir(resolve(snapshotPath, '..'));
  writeFileSync(snapshotPath, manifest.bytes);
  db.insertManifestSnapshot({
    fetched_at: nowIso(),
    content_sha256: manifest.content_sha256,
    byte_size: manifest.byte_size,
    row_count: inScope.length,
    raw_path: relative(DATA_ROOT, snapshotPath),
    releases_seen: releasesSeen,
  });

  // Per-release: upsert release row, upsert records + files, tombstone vanished.
  const releaseIdByConfig = new Map<string, ReleaseRow>();
  for (const slug of releasesSeen) {
    const grpRecords = byRelease.get(slug)!;
    const cfg: ReleaseConfig = inferReleaseFromDate(grpRecords[0]!.release_date)!;
    const releaseRow = db.upsertRelease(cfg);
    releaseIdByConfig.set(slug, releaseRow);

    // Capture released_on from the first row (all rows in this group share it).
    const releaseDate = grpRecords[0]!.release_date;
    if (releaseDate) db.setReleaseReleasedOn(releaseRow.id, releaseDate);

    for (const rec of grpRecords) {
      const upsert = db.upsertRecord({ release_id: releaseRow.id, ...stripParsedShape(rec) });
      if (upsert.action === 'inserted') counts.records_added++;
      else if (upsert.action === 'updated') counts.records_updated++;

      for (const f of rec.files) {
        const fr = db.upsertFile({ record_id: upsert.id, ...f });
        if (fr.action === 'inserted') counts.files_added++;
      }
    }

    const removed = db.tombstoneRecordsNotIn(
      releaseRow.id,
      grpRecords.map((r) => r.natural_key),
    );
    counts.records_removed += removed;
    if (removed > 0) log.info('tombstoned removed records', { slug, count: removed });
  }

  log.info('manifest ingest complete', {
    releases: releasesSeen,
    records_added: counts.records_added,
    records_updated: counts.records_updated,
    records_removed: counts.records_removed,
  });
}

// ParsedRecord carries release_slug/release_name for grouping; upsertRecord
// doesn't take those (it uses release_id). Strip them.
function stripParsedShape(r: ParsedRecord) {
  const {
    release_slug: _slug,
    release_name: _name,
    files: _files,
    ...rest
  } = r;
  return rest;
}

async function downloadAllPending(args: {
  db: Db;
  session: { request: import('playwright').APIRequestContext };
  counts: RunCounts;
  opts: RunOptions;
}): Promise<void> {
  const { db, session, counts, opts } = args;
  const limit = pLimit(DOWNLOAD_CONCURRENCY);

  let allFiles = db.listFilesNeedingDownload();
  if (opts.sourceSystems && opts.sourceSystems.length > 0) {
    allFiles = allFiles.filter((f) =>
      opts.sourceSystems!.includes(f.source_system as 'war.gov' | 'dvids'),
    );
  }
  const files = opts.fileLimit ? allFiles.slice(0, opts.fileLimit) : allFiles;

  log.info('starting download pass', {
    total: files.length,
    concurrency: DOWNLOAD_CONCURRENCY,
    fileLimit: opts.fileLimit ?? null,
  });

  const knownConfigs = allKnownReleaseConfigs();
  let done = 0;
  await Promise.all(
    files.map((file) =>
      limit(async () => {
        // Match by URL substring against the known release slugs. Falls back
        // to the first known config (matters only for DVIDS files where the
        // source_url is dvidshub.net/... and carries no release slug — the
        // download path doesn't actually need release info for DVIDS).
        const release =
          knownConfigs.find((r) => file.source_url.includes(`/${r.slug}/`)) ?? knownConfigs[0]!;
        const outcome = await downloadFile({
          request: session.request,
          db,
          file,
          release,
        });
        done++;
        if (done % 10 === 0 || done === files.length) {
          log.info('download progress', { done, total: files.length });
        }
        switch (outcome.kind) {
          case 'downloaded':
            counts.files_updated++;
            log.info('downloaded', {
              url: file.source_url,
              bytes: outcome.bytes,
            });
            break;
          case 'not-modified':
          case 'verified':
            // No counter bump; expected on idle re-runs.
            break;
          case 'failed':
            counts.files_failed++;
            log.warn('download failed', {
              url: file.source_url,
              error: outcome.error,
            });
            break;
        }
      }),
    ),
  );
}
