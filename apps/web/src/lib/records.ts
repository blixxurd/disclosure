// Query helpers that turn shared Db rows into view-model objects the
// Astro pages consume. Build-time and SSR both use these.

import { getDb } from './db.js';
import type {
  Classification,
  RecordDetail,
  RecordSummary,
  Tier,
  Theme,
  FileEntry,
  FileMetadataView,
} from './types.js';

const TIER_RANK: Record<Tier, number> = { T1: 5, T2: 4, T3: 3, T4: 2, T5: 1 };

function parseClassification(value: string | null): Classification | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Classification;
  } catch {
    return null;
  }
}

interface RecordSummaryRow {
  id: number;
  natural_key: string;
  title: string | null;
  agency: string | null;
  primary_type: string | null;
  release_date: string | null;
  incident_date: string | null;
  incident_loc: string | null;
  classification_json: string | null;
}

interface FileSummaryRow {
  record_id: number;
  kind: string;
  local_path: string | null;
}

/**
 * List every non-tombstoned record with its classification + the local
 * paths of its main file kinds (for thumbnail / pdf / video). Used by the
 * /records list page and the home page's T1 highlights.
 */
export function listRecords(): RecordSummary[] {
  const db = getDb();

  const rows = db.runQuery<RecordSummaryRow>(
    `SELECT r.id, r.natural_key, r.title, r.agency, r.primary_type,
            r.release_date, r.incident_date, r.incident_loc,
            urm.value AS classification_json
       FROM record r
       LEFT JOIN user_record_meta urm
         ON urm.record_id = r.id AND urm.key = 'classification'
      WHERE r.removed_at IS NULL
      ORDER BY r.id ASC`,
  );

  // Pull each record's file paths in one query, group by record_id.
  const fileRows = db.runQuery<FileSummaryRow>(
    `SELECT record_id, kind, local_path FROM file
      WHERE local_path IS NOT NULL`,
  );
  const filesByRecord = new Map<number, FileSummaryRow[]>();
  for (const f of fileRows) {
    const list = filesByRecord.get(f.record_id) ?? [];
    list.push(f);
    filesByRecord.set(f.record_id, list);
  }

  return rows.map((r) => {
    const files = filesByRecord.get(r.id) ?? [];
    const thumb = files.find((f) => f.kind === 'thumbnail')?.local_path ?? null;
    const pdf = files.find((f) => f.kind === 'pdf')?.local_path ?? null;
    const video = files.find((f) => f.kind === 'video')?.local_path ?? null;
    return {
      id: r.id,
      natural_key: r.natural_key,
      title: r.title,
      agency: r.agency,
      primary_type: r.primary_type,
      release_date: r.release_date,
      incident_date: r.incident_date,
      incident_loc: r.incident_loc,
      classification: parseClassification(r.classification_json),
      thumbnail_path: thumb,
      pdf_path: pdf,
      video_path: video,
    };
  });
}

/**
 * Sort records for default presentation: highest tier first (T1 → T5),
 * then alphabetic title. The "no-classification" bucket sinks to the
 * bottom.
 */
export function sortByTier(records: RecordSummary[]): RecordSummary[] {
  return [...records].sort((a, b) => {
    const ta = a.classification?.tier;
    const tb = b.classification?.tier;
    const ra = ta ? TIER_RANK[ta] : 0;
    const rb = tb ? TIER_RANK[tb] : 0;
    if (ra !== rb) return rb - ra;
    return (a.title ?? '').localeCompare(b.title ?? '');
  });
}

/** All records at a particular tier — used for home page T1 highlights. */
export function recordsAtTier(tier: Tier): RecordSummary[] {
  return listRecords().filter((r) => r.classification?.tier === tier);
}

/** Distinct values for filter UI (agencies, types, themes, releases). */
export function distinctFacets(records: RecordSummary[]): {
  agencies: string[];
  types: string[];
  themes: Theme[];
  tiers: Tier[];
  releases: string[];
} {
  const agencies = new Set<string>();
  const types = new Set<string>();
  const themes = new Set<Theme>();
  const tiers = new Set<Tier>();
  const releases = new Set<string>();
  for (const r of records) {
    if (r.agency) agencies.add(r.agency);
    if (r.primary_type) types.add(r.primary_type);
    if (r.classification?.tier) tiers.add(r.classification.tier);
    for (const t of r.classification?.themes ?? []) themes.add(t);
    const rel = releaseSlugFromNaturalKey(r.natural_key);
    if (rel) releases.add(rel);
  }
  return {
    agencies: [...agencies].sort(),
    types: [...types].sort(),
    themes: [...themes].sort() as Theme[],
    tiers: [...tiers].sort((a, b) => TIER_RANK[b] - TIER_RANK[a]),
    releases: [...releases].sort(),
  };
}

/**
 * Slugify a natural_key for use in URLs. natural_keys can be like
 * 'release_1::65_hs1-...-section_10' or 'release_1::dvids:1006119' —
 * the URL slug is just the part after the release prefix.
 */
export function slugFromNaturalKey(naturalKey: string): string {
  const idx = naturalKey.indexOf('::');
  const tail = idx >= 0 ? naturalKey.slice(idx + 2) : naturalKey;
  return tail.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/**
 * Release prefix from natural_key. Returns the prefix verbatim
 * ('release_1', 'release_02', etc.) so callers can decide how to render it.
 */
export function releaseSlugFromNaturalKey(naturalKey: string): string | null {
  const idx = naturalKey.indexOf('::');
  return idx > 0 ? naturalKey.slice(0, idx) : null;
}

/**
 * Map a release slug to a short label ('release_1' → 'R01', 'release_02' → 'R02').
 * Falls back to the slug verbatim for anything unrecognized.
 */
export function releaseLabelFromSlug(slug: string | null): string | null {
  if (!slug) return null;
  const m = slug.match(/^release_0*(\d+)$/);
  if (!m) return slug;
  return 'R' + m[1]!.padStart(2, '0');
}

// Words that stay lowercase inside a title (unless they're the first word).
const TITLE_SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of',
  'on', 'or', 'the', 'to', 'via', 'vs',
]);

function titleCase(text: string): string {
  const tokens = text.split(/(\s+)/); // keep separators
  let firstWordIdx = -1;
  return tokens
    .map((t, i) => {
      if (/^\s+$/.test(t) || t === '') return t;
      if (firstWordIdx === -1) firstWordIdx = i;
      const lower = t.toLowerCase();
      if (i !== firstWordIdx && TITLE_SMALL_WORDS.has(lower)) return lower;
      // Preserve all-caps and CamelCase words; only fix lowercase-only tokens.
      if (t === lower && /^[a-z]+$/.test(t)) return t.charAt(0).toUpperCase() + t.slice(1);
      return t;
    })
    .join('');
}

/**
 * Derive a human-readable display name from the gov's CSV Title field.
 *
 * The gov ships two title shapes: (a) friendly with an "AGENCY-UAP-XXX, ..."
 * record-ID prefix; (b) raw archival IDs like
 * "65_HS1-834228961_62-HQ-83894_Section_001" or "18_100754_ General 1946-7_Vol_2".
 * This function unwraps (a) and translates (b) into something a reader can
 * scan. The original title is still displayed underneath as the citation key
 * — never destroyed.
 */
export function friendlyTitle(title: string | null): string | null {
  if (!title) return null;
  const raw = title.trim();
  if (!raw) return null;

  // (1) FBI archival pattern: 65_HS1-{seqno}_{case-num}[_Section|_Serial|_SUB[_N]]
  const fbi = /^65_HS1-\d+_([0-9A-Z][\w.-]*?)(?:_(Section|Serial|SUB)_?(.+))?$/.exec(raw);
  if (fbi) {
    const caseNum = fbi[1]!;
    const kind = fbi[2];
    const idx = fbi[3];
    if (!kind) return `FBI Case ${caseNum}`;
    const cleanIdx = idx ? idx.replace(/^0+(\d)/, '$1') : '';
    const kindTitle = kind === 'SUB' ? 'Sub' : kind; // Section, Serial, Sub
    return cleanIdx ? `FBI Case ${caseNum}, ${kindTitle} ${cleanIdx}` : `FBI Case ${caseNum}`;
  }

  // (2) War Dept archival "NN_NNN_(HS1-NN_)?descriptive text".
  // Recognize titles that *begin* with two underscore-separated number groups
  // (and optionally an HS1- archive ID). Strip them and clean up.
  const wd =
    /^\d+_\d+(?:_HS1-\d+)?[_ ]+(.+)$/.exec(raw) ??
    /^\d+_HS1-\d+[_ ]+(.+)$/.exec(raw);
  if (wd) {
    let rest = wd[1]!.trim();
    // Drop a leading gov file-classification number like "319.1 " that
    // sometimes survives the prefix strip (e.g. 342_HS1-…_319.1 Flying Discs).
    rest = rest.replace(/^\d+\.\d+[\s_]+/, '');
    // Insert a space between letter run and digit run inside tokens like
    // "box7" → "box 7". Done before titleCase so the new "box" gets capped.
    rest = rest.replace(/([A-Za-z])(\d)/g, '$1 $2');
    // Underscores → spaces; collapse runs of whitespace.
    rest = rest.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    // Re-bracket a trailing year-in-brackets if present (rare).
    rest = rest.replace(/\[([\d.]+)\]$/, '($1)');
    return titleCase(rest);
  }

  // (3) AGENCY-UAP-XXX prefix strip. Matches:
  //   DOW-UAP-D003,        ODNI-UAP-D001,    NASA-UAP-D008,
  //   DOW-UAP-PR050,       CIA-UAP-D001,     DOE-UAP-D001,
  //   NASA-UAP-D003A,
  const agency = /^[A-Z]+(?:-[A-Z]+)*-UAP-[A-Z]{0,3}\d+[A-Za-z]?,\s*(.+)$/.exec(raw);
  if (agency) {
    let rest = agency[1]!.trim();
    // Unwrap balanced surrounding quotes.
    rest = rest.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    // Common gov typo we won't silently fix in the underlying data, but
    // we can fix it for display.
    rest = rest.replace(/\bCorrespondance\b/g, 'Correspondence');
    return rest;
  }

  // (4) Default: hand back as-is. Don't over-aggressively transform titles
  // that already read fine (e.g., "FBI Photo A001", "COMETA Report").
  return raw;
}

interface RecordDetailRow extends RecordSummaryRow {
  description: string | null;
  dvids_video_id: string | null;
  pdf_pairing: string | null;
  video_pairing: string | null;
}

interface FileDetailRow {
  id: number;
  kind: string;
  source_system: string;
  source_url: string;
  resolved_url: string | null;
  local_path: string | null;
  size_bytes: number | null;
  sha256: string | null;
  pre_decrypt_sha256: string | null;
}

interface FileTextRow {
  source: string;
  text: string;
}

interface FileMetadataRow {
  pdf_pages: number | null;
  pdf_creator: string | null;
  pdf_producer: string | null;
  pdf_created_at: string | null;
  pdf_modified_at: string | null;
  pdf_encrypted: number | null;
  pdf_permissions: string | null;
  pdf_is_scan: number | null;
  width: number | null;
  height: number | null;
  exif_software: string | null;
  duration_seconds: number | null;
  video_codec: string | null;
  video_fps: number | null;
}

export function getRecordBySlug(slug: string): RecordDetail | null {
  const db = getDb();
  // The slug is derived from the natural_key tail; rather than store it,
  // we recompute on each record and match.
  const all = listRecords();
  const summary = all.find((r) => slugFromNaturalKey(r.natural_key) === slug);
  if (!summary) return null;

  const detailRow = db.runQuery<RecordDetailRow>(
    `SELECT r.id, r.natural_key, r.title, r.agency, r.primary_type,
            r.release_date, r.incident_date, r.incident_loc,
            r.description, r.dvids_video_id, r.pdf_pairing, r.video_pairing,
            urm.value AS classification_json
       FROM record r
       LEFT JOIN user_record_meta urm
         ON urm.record_id = r.id AND urm.key = 'classification'
      WHERE r.id = ?`,
    [summary.id],
  );
  const row = detailRow[0];
  if (!row) return null;

  const fileRows = db.runQuery<FileDetailRow>(
    `SELECT id, kind, source_system, source_url, resolved_url, local_path,
            size_bytes, sha256, pre_decrypt_sha256
       FROM file WHERE record_id = ? ORDER BY kind, id`,
    [summary.id],
  );
  const files: FileEntry[] = fileRows.map((f) => ({
    id: f.id,
    kind: f.kind as FileEntry['kind'],
    source_system: f.source_system as FileEntry['source_system'],
    source_url: f.source_url,
    resolved_url: f.resolved_url,
    local_path: f.local_path,
    size_bytes: f.size_bytes,
    sha256: f.sha256,
    pre_decrypt_sha256: f.pre_decrypt_sha256,
  }));

  // Pick the primary file's id for text + metadata lookups: prefer pdf, then video, then image.
  const primaryFile =
    files.find((f) => f.kind === 'pdf') ??
    files.find((f) => f.kind === 'video') ??
    files.find((f) => f.kind === 'image') ??
    null;

  let text: { source: string; text: string } | null = null;
  let metadata: FileMetadataView | null = null;
  if (primaryFile) {
    const textRows = db.runQuery<FileTextRow>(
      'SELECT source, text FROM file_text WHERE file_id = ?',
      [primaryFile.id],
    );
    const t = textRows[0];
    if (t) text = { source: t.source, text: t.text };

    const mdRows = db.runQuery<FileMetadataRow>(
      `SELECT pdf_pages, pdf_creator, pdf_producer, pdf_created_at, pdf_modified_at,
              pdf_encrypted, pdf_permissions, pdf_is_scan,
              width, height, exif_software, duration_seconds, video_codec, video_fps
         FROM file_metadata WHERE file_id = ?`,
      [primaryFile.id],
    );
    const md = mdRows[0];
    if (md) metadata = md;
  }

  return {
    ...summary,
    description: row.description,
    dvids_video_id: row.dvids_video_id,
    pdf_pairing: row.pdf_pairing,
    video_pairing: row.video_pairing,
    files,
    text,
    metadata,
  };
}

/** Slugs for every record — used by Astro getStaticPaths if we go SSG later. */
export function listAllSlugs(): { slug: string; record: RecordSummary }[] {
  return listRecords().map((r) => ({
    slug: slugFromNaturalKey(r.natural_key),
    record: r,
  }));
}

export interface SearchHit {
  record: RecordSummary;
  file_id: number;
  kind: string;
  snippet: string;
}

/**
 * Full-text search against file_text_fts. Returns one hit per matching
 * file, with a highlighted snippet. The caller groups by record.id if
 * they want per-record results.
 */
export function searchText(query: string, limit = 50): SearchHit[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const db = getDb();
  // FTS5 MATCH expects a valid query; pass raw and let bad-query errors
  // surface as empty results (try/catch).
  let rows: {
    file_id: number;
    record_id: number;
    kind: string;
    snippet: string;
  }[] = [];
  try {
    rows = db.runQuery(
      `SELECT f.id AS file_id, f.record_id, f.kind,
              snippet(file_text_fts, 0, '<<<', '>>>', '...', 14) AS snippet
         FROM file_text_fts
         JOIN file f ON f.id = file_text_fts.rowid
        WHERE file_text_fts MATCH ?
        LIMIT ?`,
      [trimmed, limit],
    );
  } catch {
    return [];
  }

  if (rows.length === 0) return [];

  const allRecords = new Map(listRecords().map((r) => [r.id, r]));
  return rows
    .map((row) => {
      const record = allRecords.get(row.record_id);
      if (!record) return null;
      return {
        record,
        file_id: row.file_id,
        kind: row.kind,
        snippet: row.snippet,
      };
    })
    .filter((h): h is SearchHit => h !== null);
}

export interface RecordFilters {
  tier?: string;
  theme?: string;
  agency?: string;
  type?: string;
  release?: string;
}

export function filterRecords(
  records: RecordSummary[],
  filters: RecordFilters,
): RecordSummary[] {
  return records.filter((r) => {
    if (filters.tier && r.classification?.tier !== filters.tier) return false;
    if (filters.theme && !r.classification?.themes.includes(filters.theme as Theme))
      return false;
    if (filters.agency && r.agency !== filters.agency) return false;
    if (filters.type && r.primary_type !== filters.type) return false;
    if (filters.release && releaseSlugFromNaturalKey(r.natural_key) !== filters.release) return false;
    return true;
  });
}
