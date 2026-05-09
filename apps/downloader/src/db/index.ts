import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_PATH, type ReleaseConfig } from '../config.js';
import { ensureDir, nowIso } from '../util.js';
import { log } from '../log.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, 'migrations');

export interface ReleaseRow {
  id: number;
  slug: string;
  name: string;
  released_on: string | null;
  source_url: string;
  manifest_url: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface RecordRow {
  id: number;
  release_id: number;
  natural_key: string;
  content_sha256: string;
  removed_at: string | null;
}

export interface RecordUpsertInput {
  release_id: number;
  natural_key: string;
  title: string | null;
  agency: string | null;
  primary_type: string | null;
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
}

export interface FileRow {
  id: number;
  record_id: number;
  kind: string;
  source_system: string;
  source_url: string;
  resolved_url: string | null;
  local_path: string | null;
  size_bytes: number | null;
  sha256: string | null;
  content_type: string | null;
  http_status: number | null;
  http_etag: string | null;
  http_last_modified: string | null;
  fetched_at: string | null;
  fetch_attempts: number;
  fetch_error: string | null;
  pre_decrypt_sha256: string | null;
  decrypted_at: string | null;
}

export interface FileMetadataInput {
  file_id: number;
  format: string | null;
  pdf_pages: number | null;
  pdf_creator: string | null;
  pdf_producer: string | null;
  pdf_title: string | null;
  pdf_author: string | null;
  pdf_created_at: string | null;
  pdf_modified_at: string | null;
  pdf_encrypted: number | null;
  pdf_permissions: string | null;
  pdf_is_scan: number | null;
  width: number | null;
  height: number | null;
  exif_make: string | null;
  exif_model: string | null;
  exif_software: string | null;
  exif_taken_at: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  gps_altitude: number | null;
  duration_seconds: number | null;
  video_codec: string | null;
  video_bitrate: number | null;
  video_fps: number | null;
  video_frames: number | null;
  audio_codec: string | null;
  audio_channels: number | null;
  raw_metadata_json: string | null;
  extractor_version: string;
}

export interface FileTextInput {
  file_id: number;
  text: string;
  source: 'pdf-text-layer' | 'tesseract-ocr';
}

export interface FileUpsertInput {
  record_id: number;
  kind: 'pdf' | 'image' | 'thumbnail' | 'video';
  source_system: 'war.gov' | 'dvids';
  source_url: string;
}

export interface ManifestSnapshotInput {
  release_id: number;
  fetched_at: string;
  content_sha256: string;
  byte_size: number;
  row_count: number;
  raw_path: string;
}

export interface RunCounts {
  records_added: number;
  records_updated: number;
  records_removed: number;
  files_added: number;
  files_updated: number;
  files_failed: number;
}

export class Db {
  private readonly db: Database.Database;

  constructor() {
    ensureDir(dirname(DB_PATH));
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.runMigrations();
  }

  private runMigrations(): void {
    // Bootstrap: create _migration table on the very first run.
    this.db.exec(`CREATE TABLE IF NOT EXISTS _migration (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`);
    const applied = new Set(
      this.db
        .prepare<[], { version: number }>('SELECT version FROM _migration')
        .all()
        .map((r) => r.version),
    );
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const f of files) {
      const m = /^(\d+)_/.exec(f);
      if (!m) continue;
      const version = parseInt(m[1]!, 10);
      if (applied.has(version)) continue;
      const sql = readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8');
      log.info('applying migration', { version, file: f });
      const tx = this.db.transaction(() => {
        this.db.exec(sql);
        this.db
          .prepare('INSERT INTO _migration (version, name, applied_at) VALUES (?, ?, ?)')
          .run(version, f, nowIso());
      });
      tx();
    }
  }

  // ── releases ────────────────────────────────────────────────────────────
  upsertRelease(cfg: ReleaseConfig): ReleaseRow {
    const now = nowIso();
    const existing = this.db
      .prepare<[string], ReleaseRow>('SELECT * FROM release WHERE slug = ?')
      .get(cfg.slug);
    if (existing) {
      this.db
        .prepare(
          'UPDATE release SET name = ?, source_url = ?, manifest_url = ?, last_seen_at = ? WHERE id = ?',
        )
        .run(cfg.name, cfg.sourceUrl, cfg.manifestUrl, now, existing.id);
      return { ...existing, last_seen_at: now };
    }
    const result = this.db
      .prepare(
        `INSERT INTO release (slug, name, source_url, manifest_url, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(cfg.slug, cfg.name, cfg.sourceUrl, cfg.manifestUrl, now, now);
    return this.db
      .prepare<[number], ReleaseRow>('SELECT * FROM release WHERE id = ?')
      .get(Number(result.lastInsertRowid))!;
  }

  setReleaseReleasedOn(releaseId: number, releasedOn: string): void {
    this.db
      .prepare('UPDATE release SET released_on = COALESCE(released_on, ?) WHERE id = ?')
      .run(releasedOn, releaseId);
  }

  // ── manifest snapshots ──────────────────────────────────────────────────
  findLatestManifestSnapshot(releaseId: number): { content_sha256: string } | null {
    const row = this.db
      .prepare<[number], { content_sha256: string }>(
        'SELECT content_sha256 FROM manifest_snapshot WHERE release_id = ? ORDER BY id DESC LIMIT 1',
      )
      .get(releaseId);
    return row ?? null;
  }

  insertManifestSnapshot(input: ManifestSnapshotInput): void {
    this.db
      .prepare(
        `INSERT INTO manifest_snapshot
           (release_id, fetched_at, content_sha256, byte_size, row_count, raw_path)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(release_id, content_sha256) DO NOTHING`,
      )
      .run(
        input.release_id,
        input.fetched_at,
        input.content_sha256,
        input.byte_size,
        input.row_count,
        input.raw_path,
      );
  }

  // ── records ─────────────────────────────────────────────────────────────
  upsertRecord(input: RecordUpsertInput): { id: number; action: 'inserted' | 'updated' | 'unchanged' } {
    const now = nowIso();
    const existing = this.db
      .prepare<[string], RecordRow>('SELECT id, release_id, natural_key, content_sha256, removed_at FROM record WHERE natural_key = ?')
      .get(input.natural_key);

    if (existing) {
      // Always bump last_seen_at and clear tombstone (record is back / still here).
      const updateMutable = existing.content_sha256 !== input.content_sha256;
      if (updateMutable) {
        this.db
          .prepare(
            `UPDATE record SET
                title = ?, agency = ?, primary_type = ?, description = ?,
                incident_date = ?, incident_loc = ?, release_date = ?,
                dvids_video_id = ?, video_title = ?, pdf_pairing = ?, video_pairing = ?,
                redaction = ?, raw_csv_json = ?, content_sha256 = ?,
                last_seen_at = ?, removed_at = NULL
             WHERE id = ?`,
          )
          .run(
            input.title,
            input.agency,
            input.primary_type,
            input.description,
            input.incident_date,
            input.incident_loc,
            input.release_date,
            input.dvids_video_id,
            input.video_title,
            input.pdf_pairing,
            input.video_pairing,
            input.redaction,
            input.raw_csv_json,
            input.content_sha256,
            now,
            existing.id,
          );
      } else {
        this.db
          .prepare('UPDATE record SET last_seen_at = ?, removed_at = NULL WHERE id = ?')
          .run(now, existing.id);
      }
      return { id: existing.id, action: updateMutable ? 'updated' : 'unchanged' };
    }

    const result = this.db
      .prepare(
        `INSERT INTO record
           (release_id, natural_key, title, agency, primary_type, description,
            incident_date, incident_loc, release_date, dvids_video_id, video_title,
            pdf_pairing, video_pairing, redaction, raw_csv_json, content_sha256,
            first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.release_id,
        input.natural_key,
        input.title,
        input.agency,
        input.primary_type,
        input.description,
        input.incident_date,
        input.incident_loc,
        input.release_date,
        input.dvids_video_id,
        input.video_title,
        input.pdf_pairing,
        input.video_pairing,
        input.redaction,
        input.raw_csv_json,
        input.content_sha256,
        now,
        now,
      );
    return { id: Number(result.lastInsertRowid), action: 'inserted' };
  }

  tombstoneRecordsNotIn(releaseId: number, keepKeys: string[]): number {
    if (keepKeys.length === 0) {
      const result = this.db
        .prepare(
          'UPDATE record SET removed_at = ? WHERE release_id = ? AND removed_at IS NULL',
        )
        .run(nowIso(), releaseId);
      return result.changes;
    }
    // Build a parameterized NOT IN list.
    const placeholders = keepKeys.map(() => '?').join(',');
    const result = this.db
      .prepare(
        `UPDATE record SET removed_at = ?
         WHERE release_id = ? AND removed_at IS NULL
           AND natural_key NOT IN (${placeholders})`,
      )
      .run(nowIso(), releaseId, ...keepKeys);
    return result.changes;
  }

  // ── files ───────────────────────────────────────────────────────────────
  upsertFile(input: FileUpsertInput): { id: number; action: 'inserted' | 'unchanged' } {
    const existing = this.db
      .prepare<[string], FileRow>('SELECT * FROM file WHERE source_url = ?')
      .get(input.source_url);
    if (existing) {
      // Files are immutable apart from fetch state; we don't update kind/record here.
      return { id: existing.id, action: 'unchanged' };
    }
    const result = this.db
      .prepare(
        `INSERT INTO file (record_id, kind, source_system, source_url)
         VALUES (?, ?, ?, ?)`,
      )
      .run(input.record_id, input.kind, input.source_system, input.source_url);
    return { id: Number(result.lastInsertRowid), action: 'inserted' };
  }

  getFile(id: number): FileRow | null {
    return (
      this.db.prepare<[number], FileRow>('SELECT * FROM file WHERE id = ?').get(id) ?? null
    );
  }

  listFilesNeedingDownload(): FileRow[] {
    return this.db
      .prepare<[], FileRow>(`SELECT * FROM file ORDER BY id ASC`)
      .all();
  }

  setFileResolvedUrl(id: number, resolvedUrl: string): void {
    this.db.prepare('UPDATE file SET resolved_url = ? WHERE id = ?').run(resolvedUrl, id);
  }

  // Used by the indexer when a PDF gets decrypted in place. Records the
  // gov-original sha256 in pre_decrypt_sha256 (only on first decrypt) and
  // overwrites file.sha256 + size_bytes with the decrypted-version values
  // so the downloader's verify-on-disk fast path stops thinking the file
  // is corrupted.
  setFilePostDecrypt(args: {
    id: number;
    pre_decrypt_sha256: string;
    new_sha256: string;
    new_size_bytes: number;
  }): void {
    this.db
      .prepare(
        `UPDATE file SET
            pre_decrypt_sha256 = COALESCE(pre_decrypt_sha256, ?),
            sha256 = ?,
            size_bytes = ?,
            decrypted_at = ?
         WHERE id = ?`,
      )
      .run(args.pre_decrypt_sha256, args.new_sha256, args.new_size_bytes, nowIso(), args.id);
  }

  // Lists files that have been downloaded (have local_path) for the indexer.
  listDownloadedFiles(): FileRow[] {
    return this.db
      .prepare<[], FileRow>(
        `SELECT * FROM file WHERE local_path IS NOT NULL ORDER BY id ASC`,
      )
      .all();
  }

  upsertFileMetadata(input: FileMetadataInput): void {
    this.db
      .prepare(
        `INSERT INTO file_metadata
           (file_id, format,
            pdf_pages, pdf_creator, pdf_producer, pdf_title, pdf_author,
            pdf_created_at, pdf_modified_at, pdf_encrypted, pdf_permissions, pdf_is_scan,
            width, height, exif_make, exif_model, exif_software, exif_taken_at,
            gps_latitude, gps_longitude, gps_altitude,
            duration_seconds, video_codec, video_bitrate, video_fps, video_frames,
            audio_codec, audio_channels,
            raw_metadata_json, extracted_at, extractor_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(file_id) DO UPDATE SET
            format = excluded.format,
            pdf_pages = excluded.pdf_pages,
            pdf_creator = excluded.pdf_creator,
            pdf_producer = excluded.pdf_producer,
            pdf_title = excluded.pdf_title,
            pdf_author = excluded.pdf_author,
            pdf_created_at = excluded.pdf_created_at,
            pdf_modified_at = excluded.pdf_modified_at,
            pdf_encrypted = excluded.pdf_encrypted,
            pdf_permissions = excluded.pdf_permissions,
            pdf_is_scan = excluded.pdf_is_scan,
            width = excluded.width,
            height = excluded.height,
            exif_make = excluded.exif_make,
            exif_model = excluded.exif_model,
            exif_software = excluded.exif_software,
            exif_taken_at = excluded.exif_taken_at,
            gps_latitude = excluded.gps_latitude,
            gps_longitude = excluded.gps_longitude,
            gps_altitude = excluded.gps_altitude,
            duration_seconds = excluded.duration_seconds,
            video_codec = excluded.video_codec,
            video_bitrate = excluded.video_bitrate,
            video_fps = excluded.video_fps,
            video_frames = excluded.video_frames,
            audio_codec = excluded.audio_codec,
            audio_channels = excluded.audio_channels,
            raw_metadata_json = excluded.raw_metadata_json,
            extracted_at = excluded.extracted_at,
            extractor_version = excluded.extractor_version`,
      )
      .run(
        input.file_id,
        input.format,
        input.pdf_pages,
        input.pdf_creator,
        input.pdf_producer,
        input.pdf_title,
        input.pdf_author,
        input.pdf_created_at,
        input.pdf_modified_at,
        input.pdf_encrypted,
        input.pdf_permissions,
        input.pdf_is_scan,
        input.width,
        input.height,
        input.exif_make,
        input.exif_model,
        input.exif_software,
        input.exif_taken_at,
        input.gps_latitude,
        input.gps_longitude,
        input.gps_altitude,
        input.duration_seconds,
        input.video_codec,
        input.video_bitrate,
        input.video_fps,
        input.video_frames,
        input.audio_codec,
        input.audio_channels,
        input.raw_metadata_json,
        nowIso(),
        input.extractor_version,
      );
  }

  // ── user_record_meta (open-ended JSON bag for analyst annotations) ───
  // The classifier writes here; user-set rows are protected via the
  // `user_overridden` field inside the JSON value (caller checks before writing).
  getUserRecordMeta(recordId: number, key: string): { value: string } | null {
    return (
      this.db
        .prepare<[number, string], { value: string }>(
          'SELECT value FROM user_record_meta WHERE record_id = ? AND key = ?',
        )
        .get(recordId, key) ?? null
    );
  }

  upsertUserRecordMeta(recordId: number, key: string, valueJson: string): void {
    this.db
      .prepare(
        `INSERT INTO user_record_meta (record_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(record_id, key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at`,
      )
      .run(recordId, key, valueJson, nowIso());
  }

  // Iterate all records — used by the classifier to produce per-record analyses.
  listAllRecords(): { id: number; release_id: number; natural_key: string; title: string | null }[] {
    return this.db
      .prepare<[], { id: number; release_id: number; natural_key: string; title: string | null }>(
        'SELECT id, release_id, natural_key, title FROM record WHERE removed_at IS NULL ORDER BY id ASC',
      )
      .all();
  }

  // Run an arbitrary read-only SELECT (used by the classifier's keyword rules
  // which carry their own WHERE fragments). Returns rows as plain records.
  runQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  // Indexer idempotency probe: tells the indexer whether the existing extraction
  // is still fresh relative to the last download, and whether text was captured.
  getFileIndexStatus(fileId: number): {
    extracted_at: string | null;
    pdf_is_scan: number | null;
    has_text: boolean;
  } {
    const md = this.db
      .prepare<[number], { extracted_at: string; pdf_is_scan: number | null }>(
        'SELECT extracted_at, pdf_is_scan FROM file_metadata WHERE file_id = ?',
      )
      .get(fileId);
    const txt = this.db
      .prepare<[number], { x: number }>('SELECT 1 AS x FROM file_text WHERE file_id = ? LIMIT 1')
      .get(fileId);
    return {
      extracted_at: md?.extracted_at ?? null,
      pdf_is_scan: md?.pdf_is_scan ?? null,
      has_text: txt != null,
    };
  }

  upsertFileText(input: FileTextInput): void {
    const charCount = input.text.length;
    const wordCount = input.text.trim().split(/\s+/).filter(Boolean).length;
    this.db
      .prepare(
        `INSERT INTO file_text (file_id, text, source, char_count, word_count, extracted_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(file_id) DO UPDATE SET
            text = excluded.text,
            source = excluded.source,
            char_count = excluded.char_count,
            word_count = excluded.word_count,
            extracted_at = excluded.extracted_at`,
      )
      .run(input.file_id, input.text, input.source, charCount, wordCount, nowIso());
  }

  setFileSuccess(args: {
    id: number;
    local_path: string;
    size_bytes: number;
    sha256: string;
    content_type: string | null;
    http_status: number;
    http_etag: string | null;
    http_last_modified: string | null;
  }): void {
    this.db
      .prepare(
        `UPDATE file SET
            local_path = ?, size_bytes = ?, sha256 = ?, content_type = ?,
            http_status = ?, http_etag = ?, http_last_modified = ?,
            fetched_at = ?, fetch_error = NULL,
            fetch_attempts = fetch_attempts + 1
         WHERE id = ?`,
      )
      .run(
        args.local_path,
        args.size_bytes,
        args.sha256,
        args.content_type,
        args.http_status,
        args.http_etag,
        args.http_last_modified,
        nowIso(),
        args.id,
      );
  }

  setFileNotModified(id: number): void {
    this.db
      .prepare(
        `UPDATE file SET fetched_at = ?, fetch_error = NULL,
            fetch_attempts = fetch_attempts + 1
         WHERE id = ?`,
      )
      .run(nowIso(), id);
  }

  setFileError(id: number, status: number | null, error: string): void {
    this.db
      .prepare(
        `UPDATE file SET http_status = ?, fetch_error = ?,
            fetch_attempts = fetch_attempts + 1
         WHERE id = ?`,
      )
      .run(status, error, id);
  }

  // ── fetch runs ──────────────────────────────────────────────────────────
  startRun(): number {
    const result = this.db
      .prepare(`INSERT INTO fetch_run (started_at, status) VALUES (?, 'running')`)
      .run(nowIso());
    return Number(result.lastInsertRowid);
  }

  finishRun(
    runId: number,
    status: 'success' | 'failed',
    counts: RunCounts,
    notes?: string,
  ): void {
    this.db
      .prepare(
        `UPDATE fetch_run SET
            ended_at = ?, status = ?,
            records_added = ?, records_updated = ?, records_removed = ?,
            files_added = ?, files_updated = ?, files_failed = ?,
            notes = ?
         WHERE id = ?`,
      )
      .run(
        nowIso(),
        status,
        counts.records_added,
        counts.records_updated,
        counts.records_removed,
        counts.files_added,
        counts.files_updated,
        counts.files_failed,
        notes ?? null,
        runId,
      );
  }

  close(): void {
    this.db.close();
  }
}
