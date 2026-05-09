import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Db, type Logger } from '../index.js';

const silentLog: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe('Db', () => {
  let db: Db;

  beforeEach(() => {
    db = new Db({ path: ':memory:', log: silentLog });
  });

  afterEach(() => {
    db.close();
  });

  it('applies all migrations on a fresh database', () => {
    // Migrations run in the constructor. If they didn't, the queries below would fail.
    const result = db.runQuery<{ count: number }>(
      "SELECT COUNT(*) AS count FROM _migration",
    );
    expect(result[0]?.count).toBeGreaterThanOrEqual(3);
  });

  it('creates all expected tables', () => {
    const rows = db.runQuery<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const tableNames = rows.map((r) => r.name);
    for (const expected of [
      '_migration',
      'release',
      'record',
      'file',
      'manifest_snapshot',
      'fetch_run',
      'file_metadata',
      'file_text',
      'user_tag',
      'user_record_tag',
      'user_record_note',
      'user_record_meta',
    ]) {
      expect(tableNames).toContain(expected);
    }
  });

  it('upserts a release and roundtrips it', () => {
    const cfg = {
      slug: 'test_release',
      name: 'Test',
      sourceUrl: 'https://example.com/',
      manifestUrl: 'https://example.com/m.csv',
    };
    const inserted = db.upsertRelease(cfg);
    expect(inserted.id).toBeGreaterThan(0);
    expect(inserted.slug).toBe('test_release');

    // Re-upsert (idempotent) returns same id
    const second = db.upsertRelease(cfg);
    expect(second.id).toBe(inserted.id);
  });

  it('upserts a record and detects content changes', () => {
    const release = db.upsertRelease({
      slug: 'r',
      name: 'R',
      sourceUrl: 'x',
      manifestUrl: 'y',
    });

    const baseInput = {
      release_id: release.id,
      natural_key: 'nk1',
      title: 'Title',
      agency: null,
      primary_type: 'PDF',
      description: null,
      incident_date: null,
      incident_loc: null,
      release_date: null,
      dvids_video_id: null,
      video_title: null,
      pdf_pairing: null,
      video_pairing: null,
      redaction: null,
      raw_csv_json: '{}',
      content_sha256: 'hash-v1',
    };

    const first = db.upsertRecord(baseInput);
    expect(first.action).toBe('inserted');

    // Same content_sha256 → unchanged
    const same = db.upsertRecord(baseInput);
    expect(same.action).toBe('unchanged');
    expect(same.id).toBe(first.id);

    // Different content_sha256 → updated
    const updated = db.upsertRecord({ ...baseInput, content_sha256: 'hash-v2' });
    expect(updated.action).toBe('updated');
    expect(updated.id).toBe(first.id);
  });

  it('tombstones records that vanish from the manifest', () => {
    const release = db.upsertRelease({
      slug: 'r',
      name: 'R',
      sourceUrl: 'x',
      manifestUrl: 'y',
    });
    const baseInput = {
      release_id: release.id,
      title: 't',
      agency: null,
      primary_type: 'PDF',
      description: null,
      incident_date: null,
      incident_loc: null,
      release_date: null,
      dvids_video_id: null,
      video_title: null,
      pdf_pairing: null,
      video_pairing: null,
      redaction: null,
      raw_csv_json: '{}',
      content_sha256: 'hash',
    };
    db.upsertRecord({ ...baseInput, natural_key: 'keep' });
    db.upsertRecord({ ...baseInput, natural_key: 'remove' });

    const removed = db.tombstoneRecordsNotIn(release.id, ['keep']);
    expect(removed).toBe(1);

    const rows = db.runQuery<{ natural_key: string; removed_at: string | null }>(
      'SELECT natural_key, removed_at FROM record',
    );
    const map = new Map(rows.map((r) => [r.natural_key, r.removed_at]));
    expect(map.get('keep')).toBeNull();
    expect(map.get('remove')).not.toBeNull();
  });

  it('upserts user_record_meta with JSON value', () => {
    const release = db.upsertRelease({
      slug: 'r',
      name: 'R',
      sourceUrl: 'x',
      manifestUrl: 'y',
    });
    const rec = db.upsertRecord({
      release_id: release.id,
      natural_key: 'nk',
      title: null,
      agency: null,
      primary_type: null,
      description: null,
      incident_date: null,
      incident_loc: null,
      release_date: null,
      dvids_video_id: null,
      video_title: null,
      pdf_pairing: null,
      video_pairing: null,
      redaction: null,
      raw_csv_json: '{}',
      content_sha256: 'h',
    });

    db.upsertUserRecordMeta(rec.id, 'classification', JSON.stringify({ tier: 'T1' }));
    const got = db.getUserRecordMeta(rec.id, 'classification');
    expect(got).not.toBeNull();
    expect(JSON.parse(got!.value)).toEqual({ tier: 'T1' });
  });

  it('writes file_text and updates the FTS5 mirror via trigger', () => {
    const release = db.upsertRelease({
      slug: 'r',
      name: 'R',
      sourceUrl: 'x',
      manifestUrl: 'y',
    });
    const rec = db.upsertRecord({
      release_id: release.id,
      natural_key: 'nk',
      title: null,
      agency: null,
      primary_type: null,
      description: null,
      incident_date: null,
      incident_loc: null,
      release_date: null,
      dvids_video_id: null,
      video_title: null,
      pdf_pairing: null,
      video_pairing: null,
      redaction: null,
      raw_csv_json: '{}',
      content_sha256: 'h',
    });
    const file = db.upsertFile({
      record_id: rec.id,
      kind: 'pdf',
      source_system: 'war.gov',
      source_url: 'https://example.com/foo.pdf',
    });

    db.upsertFileText({
      file_id: file.id,
      text: 'extraterrestrial intelligent control',
      source: 'pdf-text-layer',
    });

    const ftsHits = db.runQuery<{ rowid: number }>(
      "SELECT rowid FROM file_text_fts WHERE file_text_fts MATCH 'extraterrestrial'",
    );
    expect(ftsHits.map((h) => h.rowid)).toContain(file.id);
  });
});
