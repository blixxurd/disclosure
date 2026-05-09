import { writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import pLimit from 'p-limit';
import { Db, type RunCounts } from './db/index.js';
import { openBrowser } from './browser.js';
import { fetchManifest, parseManifest } from './manifest.js';
import { downloadFile } from './download.js';
import {
  DATA_ROOT,
  DOWNLOAD_CONCURRENCY,
  MANIFESTS_DIR,
  RELEASES,
  type ReleaseConfig,
} from './config.js';
import { ensureDir, nowIso } from './util.js';
import { log } from './log.js';

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

  const releases = opts.releaseSlugs
    ? RELEASES.filter((r) => opts.releaseSlugs!.includes(r.slug))
    : RELEASES;

  const session = await openBrowser(releases[0]!.sourceUrl);

  try {
    for (const release of releases) {
      await processRelease({ release, db, session, opts, counts });
    }

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

async function processRelease(args: {
  release: ReleaseConfig;
  db: Db;
  session: { request: import('playwright').APIRequestContext };
  opts: RunOptions;
  counts: RunCounts;
}): Promise<void> {
  const { release, db, session, counts } = args;

  log.info('processing release', { slug: release.slug });
  const releaseRow = db.upsertRelease(release);

  // 1. Fetch manifest.
  const manifest = await fetchManifest(session.request, release.manifestUrl);
  log.info('manifest fetched', {
    slug: release.slug,
    bytes: manifest.byte_size,
    sha: manifest.content_sha256.slice(0, 12),
  });

  // 2. Compare to last snapshot. If unchanged, skip parse + upsert work.
  const last = db.findLatestManifestSnapshot(releaseRow.id);
  if (last && last.content_sha256 === manifest.content_sha256) {
    log.info('manifest unchanged since last run', { slug: release.slug });
    return;
  }

  // 3. New (or first) snapshot: persist raw bytes + index it.
  const ts = nowIso().replace(/[:.]/g, '-');
  const snapshotPath = resolve(MANIFESTS_DIR, release.slug, `${ts}.csv`);
  ensureDir(resolve(snapshotPath, '..'));
  writeFileSync(snapshotPath, manifest.bytes);

  const records = parseManifest(manifest.bytes.toString('utf8'), release);

  db.insertManifestSnapshot({
    release_id: releaseRow.id,
    fetched_at: nowIso(),
    content_sha256: manifest.content_sha256,
    byte_size: manifest.byte_size,
    row_count: records.length,
    raw_path: relative(DATA_ROOT, snapshotPath),
  });

  log.info('parsed records', { slug: release.slug, count: records.length });

  // Capture the gov's release date from the first row that has one.
  const firstReleaseDate = records.find((r) => r.release_date)?.release_date ?? null;
  if (firstReleaseDate) db.setReleaseReleasedOn(releaseRow.id, firstReleaseDate);

  // 4. Upsert records and files.
  for (const rec of records) {
    const upsert = db.upsertRecord({ release_id: releaseRow.id, ...rec });
    if (upsert.action === 'inserted') counts.records_added++;
    else if (upsert.action === 'updated') counts.records_updated++;

    for (const f of rec.files) {
      const fr = db.upsertFile({ record_id: upsert.id, ...f });
      if (fr.action === 'inserted') counts.files_added++;
    }
  }

  // 5. Tombstone records that vanished from the manifest.
  const removed = db.tombstoneRecordsNotIn(releaseRow.id, records.map((r) => r.natural_key));
  counts.records_removed += removed;
  if (removed > 0) log.info('tombstoned removed records', { slug: release.slug, count: removed });
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

  let done = 0;
  await Promise.all(
    files.map((file) =>
      limit(async () => {
        const release =
          RELEASES.find((r) =>
            file.source_url.includes(`/${r.slug}/`),
          ) ?? RELEASES[0]!;
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
