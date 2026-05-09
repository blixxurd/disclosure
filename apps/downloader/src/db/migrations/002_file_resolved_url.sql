-- DVIDS videos: source_url stays canonical (dvidshub.net/video/{id}); the
-- actual CloudFront mp4 URL gets resolved per-fetch and cached here. This
-- column is also useful for any future source where the canonical reference
-- and the byte-stream URL differ.
ALTER TABLE file ADD COLUMN resolved_url TEXT;
