-- War.gov now ships ONE merged CSV (`uap-data.csv`) that contains every
-- release. manifest_snapshot was modeled per-release (release_id FK + UNIQUE
-- on (release_id, content_sha256)) — that no longer fits.
--
-- New shape: snapshot is global, identified by content_sha256, with a
-- releases_seen JSON array listing which release slugs were present in those
-- bytes. release_id is dropped.
--
-- SQLite can't drop a column or a UNIQUE in-place; rebuild + swap.

CREATE TABLE manifest_snapshot_new (
  id             INTEGER PRIMARY KEY,
  fetched_at     TEXT NOT NULL,
  content_sha256 TEXT NOT NULL UNIQUE,
  byte_size      INTEGER NOT NULL,
  row_count      INTEGER NOT NULL,
  raw_path       TEXT NOT NULL,
  releases_seen  TEXT NOT NULL
);

INSERT INTO manifest_snapshot_new
  (id, fetched_at, content_sha256, byte_size, row_count, raw_path, releases_seen)
SELECT
  ms.id,
  ms.fetched_at,
  ms.content_sha256,
  ms.byte_size,
  ms.row_count,
  ms.raw_path,
  json_array(r.slug)
FROM manifest_snapshot ms
JOIN release r ON r.id = ms.release_id;

DROP TABLE manifest_snapshot;
ALTER TABLE manifest_snapshot_new RENAME TO manifest_snapshot;
