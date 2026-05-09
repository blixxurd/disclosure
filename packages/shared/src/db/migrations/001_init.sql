-- Initial schema. See docs/SCHEMA.md for the design rationale.
-- PRAGMAs (WAL, foreign_keys) are set in code outside the transaction —
-- SQLite forbids changing some PRAGMAs inside a transaction.
-- The _migration table is bootstrapped in code before any migration runs.

-- ── GOV LAYER ─────────────────────────────────────────────────────────────
CREATE TABLE release (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  released_on   TEXT,
  source_url    TEXT NOT NULL,
  manifest_url  TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);

CREATE TABLE record (
  id              INTEGER PRIMARY KEY,
  release_id      INTEGER NOT NULL REFERENCES release(id),
  natural_key     TEXT NOT NULL UNIQUE,
  title           TEXT,
  agency          TEXT,
  primary_type    TEXT,
  description     TEXT,
  incident_date   TEXT,
  incident_loc    TEXT,
  release_date    TEXT,
  dvids_video_id  TEXT,
  video_title     TEXT,
  pdf_pairing     TEXT,
  video_pairing   TEXT,
  redaction       TEXT,
  raw_csv_json    TEXT NOT NULL,
  content_sha256  TEXT NOT NULL,
  first_seen_at   TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  removed_at      TEXT
);

CREATE INDEX idx_record_release ON record(release_id);
CREATE INDEX idx_record_agency  ON record(agency);
CREATE INDEX idx_record_type    ON record(primary_type);

CREATE TABLE file (
  id                 INTEGER PRIMARY KEY,
  record_id          INTEGER NOT NULL REFERENCES record(id),
  kind               TEXT NOT NULL,
  source_system      TEXT NOT NULL,
  source_url         TEXT NOT NULL UNIQUE,
  local_path         TEXT,
  size_bytes         INTEGER,
  sha256             TEXT,
  content_type       TEXT,
  http_status        INTEGER,
  http_etag          TEXT,
  http_last_modified TEXT,
  fetched_at         TEXT,
  fetch_attempts     INTEGER NOT NULL DEFAULT 0,
  fetch_error        TEXT,
  UNIQUE (record_id, kind, source_url)
);

CREATE INDEX idx_file_record ON file(record_id);
CREATE INDEX idx_file_kind   ON file(kind);

-- ── AUDIT LAYER ───────────────────────────────────────────────────────────
CREATE TABLE manifest_snapshot (
  id             INTEGER PRIMARY KEY,
  release_id     INTEGER NOT NULL REFERENCES release(id),
  fetched_at     TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  byte_size      INTEGER NOT NULL,
  row_count      INTEGER NOT NULL,
  raw_path       TEXT NOT NULL,
  UNIQUE (release_id, content_sha256)
);

CREATE TABLE fetch_run (
  id              INTEGER PRIMARY KEY,
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  status          TEXT NOT NULL,
  records_added   INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_removed INTEGER NOT NULL DEFAULT 0,
  files_added     INTEGER NOT NULL DEFAULT 0,
  files_updated   INTEGER NOT NULL DEFAULT 0,
  files_failed    INTEGER NOT NULL DEFAULT 0,
  notes           TEXT
);

-- ── USER LAYER (downloader does not write) ───────────────────────────────
CREATE TABLE user_tag (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  color       TEXT,
  description TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE user_record_tag (
  record_id  INTEGER NOT NULL REFERENCES record(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES user_tag(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (record_id, tag_id)
);

CREATE TABLE user_record_note (
  id         INTEGER PRIMARY KEY,
  record_id  INTEGER NOT NULL REFERENCES record(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE user_record_meta (
  record_id  INTEGER NOT NULL REFERENCES record(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (record_id, key)
);
