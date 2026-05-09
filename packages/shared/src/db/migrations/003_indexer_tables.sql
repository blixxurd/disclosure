-- Indexer tables. Populated by `apps/indexer`, never written by `apps/downloader`.

-- Track decryption performed on the file's bytes. The original gov sha256
-- is preserved in pre_decrypt_sha256 so anyone can verify the gov shipped
-- exactly that file. After decryption, file.sha256 reflects the decrypted
-- bytes (so the downloader's verify-on-disk fast path keeps working).
ALTER TABLE file ADD COLUMN pre_decrypt_sha256 TEXT;
ALTER TABLE file ADD COLUMN decrypted_at       TEXT;

-- Per-file structured metadata. Common fields broken out as columns; full
-- exiftool/pdfinfo/ffprobe JSON kept in raw_metadata_json for forward-compat.
CREATE TABLE file_metadata (
  file_id           INTEGER PRIMARY KEY REFERENCES file(id) ON DELETE CASCADE,
  format            TEXT,
  -- PDF
  pdf_pages         INTEGER,
  pdf_creator       TEXT,
  pdf_producer      TEXT,
  pdf_title         TEXT,
  pdf_author        TEXT,
  pdf_created_at    TEXT,
  pdf_modified_at   TEXT,
  pdf_encrypted     INTEGER,
  pdf_permissions   TEXT,
  pdf_is_scan       INTEGER,
  -- Image / video shared
  width             INTEGER,
  height            INTEGER,
  exif_make         TEXT,
  exif_model        TEXT,
  exif_software     TEXT,
  exif_taken_at     TEXT,
  gps_latitude      REAL,
  gps_longitude     REAL,
  gps_altitude      REAL,
  -- Video
  duration_seconds  REAL,
  video_codec       TEXT,
  video_bitrate     INTEGER,
  video_fps         REAL,
  video_frames      INTEGER,
  audio_codec       TEXT,
  audio_channels    INTEGER,
  -- Catch-all
  raw_metadata_json TEXT,
  extracted_at      TEXT NOT NULL,
  extractor_version TEXT
);

CREATE INDEX idx_file_metadata_format    ON file_metadata(format);
CREATE INDEX idx_file_metadata_gps       ON file_metadata(gps_latitude, gps_longitude);
CREATE INDEX idx_file_metadata_exif_make ON file_metadata(exif_make);
CREATE INDEX idx_file_metadata_creator   ON file_metadata(pdf_creator);

-- Extracted text from PDFs (text layer or OCR). Kept in its own table so
-- we can swap extraction methods (re-OCR with a better model) without
-- touching metadata.
CREATE TABLE file_text (
  file_id      INTEGER PRIMARY KEY REFERENCES file(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  source       TEXT NOT NULL,    -- 'pdf-text-layer' | 'tesseract-ocr'
  char_count   INTEGER,
  word_count   INTEGER,
  extracted_at TEXT NOT NULL
);

-- Full-text search index. Content-rowid-linked to file_text so updates flow.
CREATE VIRTUAL TABLE file_text_fts USING fts5(
  text,
  content='file_text',
  content_rowid='file_id',
  tokenize='porter unicode61'
);

CREATE TRIGGER file_text_ai AFTER INSERT ON file_text BEGIN
  INSERT INTO file_text_fts(rowid, text) VALUES (new.file_id, new.text);
END;
CREATE TRIGGER file_text_ad AFTER DELETE ON file_text BEGIN
  INSERT INTO file_text_fts(file_text_fts, rowid, text) VALUES('delete', old.file_id, old.text);
END;
CREATE TRIGGER file_text_au AFTER UPDATE ON file_text BEGIN
  INSERT INTO file_text_fts(file_text_fts, rowid, text) VALUES('delete', old.file_id, old.text);
  INSERT INTO file_text_fts(rowid, text) VALUES (new.file_id, new.text);
END;
