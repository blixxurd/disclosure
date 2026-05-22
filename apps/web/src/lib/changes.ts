// Diffs the earliest Release-01 manifest snapshot against the most recent one
// and surfaces the gov's silent edits between releases. This is the
// "interesting data point" view that the gov's own site does not provide.
//
// Result is computed once per process and cached in module memory. Cheap to
// recompute on each manifest_snapshot insert, but for now the diff is static
// between releases.

import Papa from 'papaparse';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_ROOT } from '@disclosure/shared/config';
import { getDb } from './db.js';

export type EditKind =
  | 'title'
  | 'description'
  | 'pdf_pairing'
  | 'video_pairing'
  | 'file_replaced'
  | 'tombstoned';

export interface RetroactiveEdit {
  natural_key: string;
  url_slug: string;       // for /records/{slug} links
  current_title: string | null;
  kind: EditKind;
  old: string | null;
  new: string | null;
}

export interface ChangesReport {
  baseline_at: string;    // ISO timestamp of earliest snapshot
  current_at: string;     // ISO timestamp of latest snapshot
  baseline_path: string;
  current_path: string;
  total: number;
  by_kind: Record<EditKind, number>;
  edits: RetroactiveEdit[];
}

interface SnapshotRow {
  id: number;
  fetched_at: string;
  raw_path: string;
  releases_seen: string;
}

interface RawCsvRow {
  Title?: string;
  'Release Date'?: string;
  'Description Blurb'?: string;
  'PDF Pairing'?: string;
  'Video Pairing'?: string;
  'PDF | Image Link'?: string;
  'DVIDS Video ID'?: string;
  Type?: string;
}

let _cache: ChangesReport | null = null;

export function getChangesReport(): ChangesReport {
  if (_cache) return _cache;
  _cache = computeChangesReport();
  return _cache;
}

function computeChangesReport(): ChangesReport {
  const db = getDb();
  const snapshots = db.runQuery<SnapshotRow>(
    `SELECT id, fetched_at, raw_path, releases_seen
       FROM manifest_snapshot
      WHERE releases_seen LIKE '%release_1%'
      ORDER BY fetched_at ASC`,
  );

  // Need at least two snapshots covering R01 to have anything to diff.
  if (snapshots.length < 2) {
    return emptyReport(snapshots[0]?.fetched_at, snapshots[0]?.raw_path);
  }

  const baseline = snapshots[0]!;
  const current = snapshots[snapshots.length - 1]!;

  const baselineRows = filterR01(parseCsv(resolve(DATA_ROOT, baseline.raw_path)));
  const currentRows = filterR01(parseCsv(resolve(DATA_ROOT, current.raw_path)));

  const baselineByKey = indexByMatchKey(baselineRows);
  const currentByKey = indexByMatchKey(currentRows);

  const edits: RetroactiveEdit[] = [];

  // For every key in the baseline, look up its current state.
  for (const [key, oldRow] of baselineByKey) {
    const newRow = currentByKey.get(key);
    if (!newRow) {
      // Either the underlying file was renamed (file_replaced) or the record
      // truly went away (tombstoned). Distinguish using the DB's removed_at.
      const tombstoneInfo = lookupTombstone(key);
      const naturalKey = `release_1::${key}`;
      if (tombstoneInfo?.replacement_natural_key) {
        edits.push({
          natural_key: naturalKey,
          url_slug: slugify(tombstoneInfo.replacement_natural_key),
          current_title: tombstoneInfo.replacement_title,
          kind: 'file_replaced',
          old: oldRow.Title ?? null,
          new: tombstoneInfo.replacement_title,
        });
      } else {
        edits.push({
          natural_key: naturalKey,
          url_slug: slugify(naturalKey),
          current_title: oldRow.Title ?? null,
          kind: 'tombstoned',
          old: oldRow.Title ?? null,
          new: null,
        });
      }
      continue;
    }

    const naturalKey = `release_1::${key}`;
    const slug = slugify(naturalKey);

    // Title change (the dominant edit class — gov zero-padded many R01 IDs).
    const oldTitle = (oldRow.Title ?? '').trim();
    const newTitle = (newRow.Title ?? '').trim();
    if (oldTitle !== newTitle && oldTitle && newTitle) {
      edits.push({
        natural_key: naturalKey,
        url_slug: slug,
        current_title: newTitle,
        kind: 'title',
        old: oldTitle,
        new: newTitle,
      });
    }

    // Description Blurb — only flag substantive edits (>10 chars different
    // anywhere). Avoids reporting trivial whitespace fixes.
    const oldDesc = (oldRow['Description Blurb'] ?? '').trim();
    const newDesc = (newRow['Description Blurb'] ?? '').trim();
    if (oldDesc !== newDesc && substantiveDescDiff(oldDesc, newDesc)) {
      edits.push({
        natural_key: naturalKey,
        url_slug: slug,
        current_title: newTitle || oldTitle,
        kind: 'description',
        old: oldDesc || null,
        new: newDesc || null,
      });
    }

    // PDF Pairing changes — cross-reference re-curation.
    const oldPdfP = (oldRow['PDF Pairing'] ?? '').trim();
    const newPdfP = (newRow['PDF Pairing'] ?? '').trim();
    if (oldPdfP !== newPdfP) {
      edits.push({
        natural_key: naturalKey,
        url_slug: slug,
        current_title: newTitle || oldTitle,
        kind: 'pdf_pairing',
        old: oldPdfP || null,
        new: newPdfP || null,
      });
    }

    const oldVidP = (oldRow['Video Pairing'] ?? '').trim();
    const newVidP = (newRow['Video Pairing'] ?? '').trim();
    if (oldVidP !== newVidP) {
      edits.push({
        natural_key: naturalKey,
        url_slug: slug,
        current_title: newTitle || oldTitle,
        kind: 'video_pairing',
        old: oldVidP || null,
        new: newVidP || null,
      });
    }
  }

  const by_kind: Record<EditKind, number> = {
    title: 0,
    description: 0,
    pdf_pairing: 0,
    video_pairing: 0,
    file_replaced: 0,
    tombstoned: 0,
  };
  for (const e of edits) by_kind[e.kind]++;

  return {
    baseline_at: baseline.fetched_at,
    current_at: current.fetched_at,
    baseline_path: baseline.raw_path,
    current_path: current.raw_path,
    total: edits.length,
    by_kind,
    edits,
  };
}

function emptyReport(at: string | undefined, path: string | undefined): ChangesReport {
  return {
    baseline_at: at ?? '',
    current_at: at ?? '',
    baseline_path: path ?? '',
    current_path: path ?? '',
    total: 0,
    by_kind: { title: 0, description: 0, pdf_pairing: 0, video_pairing: 0, file_replaced: 0, tombstoned: 0 },
    edits: [],
  };
}

function parseCsv(path: string): RawCsvRow[] {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  return Papa.parse<RawCsvRow>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  }).data.filter((r) => r && r.Title);
}

function filterR01(rows: RawCsvRow[]): RawCsvRow[] {
  // The earliest snapshot is R01-only (so all rows pass). The newer snapshot
  // is merged, so filter by Release Date.
  return rows.filter((r) => {
    const rd = (r['Release Date'] ?? '').trim();
    return rd === '' || rd === '5/8/26';
  });
}

// Build a match key in the same shape as the downloader's natural_key tail:
// for VID/AUD rows, 'dvids:{id}'; otherwise the URL slug.
function matchKey(row: RawCsvRow): string | null {
  const type = (row.Type ?? '').trim().toUpperCase();
  const dvids = (row['DVIDS Video ID'] ?? '').trim();
  if ((type === 'VID' || type === 'AUD') && dvids) return `dvids:${dvids}`;
  const url = (row['PDF | Image Link'] ?? '').trim();
  if (url) {
    const slug = urlBasenameSlug(url);
    if (slug) return slug;
  }
  if (dvids) return `dvids:${dvids}`;
  return null;
}

function indexByMatchKey(rows: RawCsvRow[]): Map<string, RawCsvRow> {
  const m = new Map<string, RawCsvRow>();
  for (const r of rows) {
    const k = matchKey(r);
    if (k && !m.has(k)) m.set(k, r); // first wins (matches downloader dedupe)
  }
  return m;
}

function urlBasenameSlug(url: string): string | null {
  const last = url.split('/').pop() ?? '';
  const noExt = last.replace(/\.[^.]+$/, '');
  return noExt ? noExt.toLowerCase() : null;
}

function slugify(naturalKey: string): string {
  const idx = naturalKey.indexOf('::');
  const tail = idx >= 0 ? naturalKey.slice(idx + 2) : naturalKey;
  return tail.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function substantiveDescDiff(a: string, b: string): boolean {
  // Cheap heuristic: more than 5 characters of net difference. Filters out
  // whitespace/punctuation tweaks while still catching date corrections
  // (e.g., '7/18/52' → '7/28/52' = 1-char diff, but the *whole sentence*
  // around it would be re-saved). Use absolute length delta as floor +
  // require some token-level difference.
  if (Math.abs(a.length - b.length) > 3) return true;
  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));
  let added = 0;
  for (const t of bTokens) if (!aTokens.has(t)) added++;
  return added >= 2;
}

interface TombstoneInfo {
  replacement_natural_key: string | null;
  replacement_title: string | null;
}

// When a row's match-key (URL slug or DVIDS id) disappears between snapshots,
// the gov either deleted the record OR renamed the underlying file. We can't
// always tell from the CSV alone — but we recorded both states in the DB:
// the old natural_key is tombstoned, and the replacement (if any) shares a
// similar title. For this report we look for a recently-inserted active
// record whose title overlaps the old one. Best-effort heuristic.
function lookupTombstone(matchKey: string): TombstoneInfo | null {
  const db = getDb();
  const naturalKey = `release_1::${matchKey}`;
  const tomb = db.runQuery<{ title: string | null }>(
    `SELECT title FROM record WHERE natural_key = ? AND removed_at IS NOT NULL LIMIT 1`,
    [naturalKey],
  );
  if (tomb.length === 0) return null;
  const tombTitle = tomb[0]!.title ?? '';
  // Look for an active R01 record whose title shares the first 8 chars of the
  // tombstoned title (matches "DOW-UAP-D" series identifiers).
  const prefix = tombTitle.slice(0, 8);
  if (!prefix) return { replacement_natural_key: null, replacement_title: null };
  const repl = db.runQuery<{ natural_key: string; title: string | null }>(
    `SELECT natural_key, title FROM record
      WHERE release_id = (SELECT id FROM release WHERE slug = 'release_1')
        AND removed_at IS NULL
        AND title LIKE ? || '%'
      ORDER BY id DESC LIMIT 1`,
    [prefix],
  );
  if (repl.length === 0) return { replacement_natural_key: null, replacement_title: null };
  return {
    replacement_natural_key: repl[0]!.natural_key,
    replacement_title: repl[0]!.title,
  };
}
