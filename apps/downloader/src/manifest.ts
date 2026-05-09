import Papa from 'papaparse';
import type { APIRequestContext } from 'playwright';
import { sha256, urlSlug } from '@disclosure/shared/util';
import { createLogger } from '@disclosure/shared/log';
import type { ReleaseConfig } from '@disclosure/shared/db';

const log = createLogger('');

// What the war.gov CSV gives us, before we normalize.
interface RawRow {
  Redaction?: string;
  'Release Date'?: string;
  Title?: string;
  Type?: string;
  'Video Pairing'?: string;
  'PDF Pairing'?: string;
  'Description Blurb'?: string;
  'DVIDS Video ID'?: string;
  'Video Title'?: string;
  Agency?: string;
  'Incident Date'?: string;
  'Incident Location'?: string;
  'PDF | Image Link'?: string;
  'Modal Image'?: string;
}

export interface ParsedRecord {
  natural_key: string;
  title: string | null;
  agency: string | null;
  primary_type: 'PDF' | 'IMG' | 'VID' | null;
  description: string | null;
  incident_date: string | null;
  incident_loc: string | null;
  release_date: string | null;
  dvids_video_id: string | null;
  video_title: string | null;
  pdf_pairing: string | null;
  video_pairing: string | null;
  redaction: string | null;
  raw_csv_json: string;
  content_sha256: string;
  files: ParsedFile[];
}

export interface ParsedFile {
  kind: 'pdf' | 'image' | 'thumbnail' | 'video';
  source_system: 'war.gov' | 'dvids';
  source_url: string;
}

export interface ManifestFetchResult {
  bytes: Buffer;
  content_sha256: string;
  byte_size: number;
}

// Fetch the CSV through the authenticated browser context.
export async function fetchManifest(
  request: APIRequestContext,
  manifestUrl: string,
): Promise<ManifestFetchResult> {
  const resp = await request.get(manifestUrl, { timeout: 60_000 });
  if (resp.status() !== 200) {
    throw new Error(`manifest fetch returned HTTP ${resp.status()} for ${manifestUrl}`);
  }
  const bytes = await resp.body();
  return {
    bytes,
    content_sha256: sha256(bytes),
    byte_size: bytes.byteLength,
  };
}

// Parse and dedupe the CSV.
export function parseManifest(
  csvText: string,
  release: ReleaseConfig,
): ParsedRecord[] {
  // Strip BOM if present (war.gov CSV starts with U+FEFF).
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;

  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      log.warn('csv parse warning', { row: err.row, type: err.type, msg: err.message });
    }
  }

  const records: ParsedRecord[] = [];
  const seenKeys = new Set<string>();

  for (const row of result.data) {
    if (!row || !row.Title) continue;
    const parsed = rowToRecord(row, release);
    if (!parsed) continue;
    if (seenKeys.has(parsed.natural_key)) {
      log.debug('skipping duplicate row', { natural_key: parsed.natural_key });
      continue;
    }
    seenKeys.add(parsed.natural_key);
    records.push(parsed);
  }

  return records;
}

function rowToRecord(row: RawRow, release: ReleaseConfig): ParsedRecord | null {
  const title = trimOrNull(row.Title);
  if (!title) return null;

  const rawType = trimOrNull(row.Type);
  const primary_type = normalizeType(rawType);
  const dvids_video_id = trimOrNull(row['DVIDS Video ID']);
  const mainUrl = trimOrNull(row['PDF | Image Link']);
  const thumbnailUrl = trimOrNull(row['Modal Image']);

  const natural_key = deriveNaturalKey({
    release,
    title,
    primary_type,
    mainUrl,
    dvids_video_id,
  });
  if (!natural_key) return null;

  const files: ParsedFile[] = [];

  // For VID rows, `PDF | Image Link` is a cross-reference pointing at a *paired*
  // PDF record's file — not a file belonging to the video record itself.
  // (The cross-ref is captured separately in pdf_pairing.) For PDF/IMG rows,
  // the link is the record's main file.
  if (mainUrl && primary_type !== 'VID') {
    const kind: ParsedFile['kind'] = primary_type === 'IMG' ? 'image' : 'pdf';
    files.push({ kind, source_system: 'war.gov', source_url: mainUrl });
  }
  if (thumbnailUrl) {
    files.push({ kind: 'thumbnail', source_system: 'war.gov', source_url: thumbnailUrl });
  }
  if (dvids_video_id) {
    // Placeholder file row — schema-ready for the future DVIDS resolver.
    // source_url is the DVIDS web page URL until we add API-driven mp4 resolution.
    files.push({
      kind: 'video',
      source_system: 'dvids',
      source_url: `https://www.dvidshub.net/video/${dvids_video_id}`,
    });
  }

  const description = trimOrNull(row['Description Blurb']);
  const agency = trimOrNull(row.Agency);
  const incident_date = trimOrNull(row['Incident Date']);
  const incident_loc = trimOrNull(row['Incident Location']);
  const release_date = trimOrNull(row['Release Date']);
  const video_title = trimOrNull(row['Video Title']);
  const pdf_pairing = trimOrNull(row['PDF Pairing']);
  const video_pairing = trimOrNull(row['Video Pairing']);
  const redaction = trimOrNull(row.Redaction);

  // raw_csv_json preserves every original column verbatim — including the
  // empty trailing columns and any future columns the gov adds.
  const raw_csv_json = JSON.stringify(row);

  // content_sha256: salient fields only. If gov edits a description or adds a
  // file, this changes → we re-process the record.
  const salient = {
    title,
    agency,
    primary_type,
    description,
    incident_date,
    incident_loc,
    release_date,
    dvids_video_id,
    video_title,
    pdf_pairing,
    video_pairing,
    redaction,
    files: files.map((f) => `${f.kind}|${f.source_url}`).sort(),
  };
  const content_sha256 = sha256(JSON.stringify(salient));

  return {
    natural_key,
    title,
    agency,
    primary_type,
    description,
    incident_date,
    incident_loc,
    release_date,
    dvids_video_id,
    video_title,
    pdf_pairing,
    video_pairing,
    redaction,
    raw_csv_json,
    content_sha256,
    files,
  };
}

function trimOrNull(s: string | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

function normalizeType(raw: string | null): 'PDF' | 'IMG' | 'VID' | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  if (up === 'PDF' || up === 'IMG' || up === 'VID') return up;
  // Future-proof: unknown types passed through as null + logged.
  log.warn('unknown record Type', { raw });
  return null;
}

function deriveNaturalKey(args: {
  release: ReleaseConfig;
  title: string;
  primary_type: 'PDF' | 'IMG' | 'VID' | null;
  mainUrl: string | null;
  dvids_video_id: string | null;
}): string | null {
  // VID rows: identify by DVIDS id. The mainUrl on these rows is a
  // cross-reference to a paired PDF record, not this record's own file.
  if (args.primary_type === 'VID' && args.dvids_video_id) {
    return `${args.release.slug}::dvids:${args.dvids_video_id}`;
  }
  if (args.mainUrl) {
    const slug = urlSlug(args.mainUrl);
    if (slug) return `${args.release.slug}::${slug}`;
  }
  if (args.dvids_video_id) {
    return `${args.release.slug}::dvids:${args.dvids_video_id}`;
  }
  // Last-resort fallback: hash of title (stable across runs).
  const titleHash = sha256(`${args.release.slug}::${args.title.trim()}`).slice(0, 16);
  return `${args.release.slug}::title:${titleHash}`;
}
