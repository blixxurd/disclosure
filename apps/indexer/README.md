# @disclosure/indexer

Reads what the downloader put on disk, extracts every metadata signal we can
get, decrypts soft-encrypted PDFs in place, and pulls full text into a SQLite
FTS5 index. Run *after* `@disclosure/downloader`.

## What it does, per file

| Kind | Pipeline |
|---|---|
| **PDF** | `pdfinfo` (Info dict) → `qpdf --decrypt` if soft-encrypted → `pdftotext` for the text layer → `tesseract` OCR (only if `--ocr` and the text layer is missing/scan-thin) → `exiftool` for XMP / extra metadata → write to `file_metadata` + `file_text` |
| **Image** (`.jpg/.png`) | `exiftool` → `file_metadata` |
| **Thumbnail** | `exiftool` → `file_metadata` |
| **Video** (`.mp4`) | `exiftool` → `file_metadata` (codec, duration, fps, bitrate, audio params) |

PDFs that would parse as readable text but the gov shipped with `print:yes
copy:no` AES-256 encryption get **decrypted in place** — the original gov
sha256 is preserved in `file.pre_decrypt_sha256` so anyone can verify the
gov shipped exactly those bytes; the post-decrypt hash takes over `file.sha256`
so the downloader's verify-on-disk fast path keeps working.

This restriction-stripping is legal: these are public-domain US government
records, and the gov themselves allow `print:yes`. The encryption is
intentional friction against text extraction, not a real security boundary.

## System dependencies

```sh
brew install poppler qpdf tesseract
```

- **poppler** — provides `pdfinfo`, `pdftotext`, `pdftoppm`
- **qpdf** — strips soft restrictions from gov PDFs
- **tesseract** — OCRs scanned PDFs (only used with `--ocr`)
- **exiftool** — bundled via `exiftool-vendored` (no system install)

If a binary is missing, the indexer logs a warning and skips that step.
Re-runs will retry once the binary is installed.

## Run it

```sh
pnpm --filter @disclosure/indexer run dev                 # text-layer only (fast)
pnpm --filter @disclosure/indexer run dev --ocr           # full pass with tesseract OCR (slow)
pnpm --filter @disclosure/indexer run dev --limit 5       # smoke test
pnpm --filter @disclosure/indexer run dev --kind pdf      # only PDFs
pnpm --filter @disclosure/indexer run dev --force         # ignore skip-if-fresh and re-extract everything
```

`pnpm refresh` (from repo root) runs this app with `--ocr` by default.

## Idempotency

The indexer skips a file when:

- `file_metadata.extracted_at` is set, **and**
- `file_metadata.extracted_at >= file.fetched_at`, **and**
- It doesn't owe text extraction (i.e. either it isn't a scan, OR text was
  already captured, OR `--ocr` is off).

This means:

- A no-op `--ocr` re-run on an unchanged corpus completes in seconds, not hours.
- Switching from `--no-ocr` to `--ocr` only triggers OCR on the scans that
  weren't OCR'd previously — already-text-layer-extracted PDFs stay put.
- A re-downloaded file (sha or fetched_at changed) gets re-extracted on the
  next run; `--force` overrides the skip entirely.

## Performance

On Release 01's 288 files (~3.7 GB, 116 PDFs incl. ~1,500 OCR-needing pages):

| Mode | Wall time |
|---|---|
| Fast pass (no OCR), cold | ~30 s |
| Full pass (`--ocr`), cold | ~60 min |
| Re-run, no changes | ~5 s |
| Re-run after Release 02 adds 50 files (estimate) | ~2 min |

Bottleneck is tesseract on big multi-page scans. Concurrency is 4 for PDFs,
4 for everything else. tesseract is single-threaded per invocation, so 4
parallel PDFs ≈ 4 cores busy. Lower-DPI rasterization (150 dpi) cuts memory
without hurting OCR quality on document scans.

## Layout

```
src/
├── index.ts        # CLI — flags: --ocr --force --limit --kind
├── run.ts          # orchestrator: walks file rows, dispatches per kind
├── pdf.ts          # pdfinfo + qpdf decrypt + pdftotext + scan heuristic
├── ocr.ts          # pdftoppm + tesseract per-page pipeline
├── exif.ts         # exiftool-vendored wrapper + field normalization
├── log.ts
└── util.ts         # spawn() helper, sha256
```

The `Db` class and migrations live in `packages/shared/` — imported as
`@disclosure/shared/db`.

## Output

- **`file_metadata`** — one row per indexed file. Common fields broken out
  as columns; full exiftool/pdfinfo JSON in `raw_metadata_json`.
- **`file_text`** — one row per file with extracted text. `source` column
  records `'pdf-text-layer'` vs `'tesseract-ocr'`.
- **`file_text_fts`** — FTS5 virtual table backed by `file_text`. Triggers
  keep it in sync.
- **Decryption side-effects** on `file`: `pre_decrypt_sha256`, `decrypted_at`,
  and an updated `sha256` reflecting the decrypted bytes.

## Adding a new file kind

1. Bump `kind` to your new value in `apps/downloader/src/manifest.ts`
   (so the downloader writes the new kind).
2. Add a branch in `indexOne()` in `src/run.ts` that dispatches to a new
   handler.
3. Implement the handler — see `indexImage()` / `indexVideo()` for shape.
4. If the new kind is large or slow, adjust the `pdfLimit` / `otherLimit`
   in `runOnce()`.

No DB migration needed unless you're capturing a field that doesn't fit any
existing column on `file_metadata` — in that case add migration `004_*.sql`
to `packages/shared/src/db/migrations/` and update the `FileMetadataInput`
interface in `packages/shared/src/db/index.ts`.

## Troubleshooting

**OCR is producing garbage** for a particular PDF: rasterization DPI
might be too low for that document, or the scan quality is poor. Bump
`-r 150` to `-r 300` in `src/ocr.ts` for that case, or add a per-file
override.

**`qpdf decrypt failed: invalid password`**: the PDF is *actually*
password-protected, not just permission-restricted. Skip is the right
behavior; the original file stays untouched.

**Mission Reports D63/D64/D65** (Strait of Hormuz / Iran / Persian Gulf
2020) fail `pdftotext` with "Unterminated string" / "Dictionary key must
be a name object". These are malformed in the gov's source. `qpdf
--check` may be able to repair them; not currently automated.

**`spawn ENOENT`** for a system binary: `brew install` it (see top).
The indexer continues without that step on missing binaries.
