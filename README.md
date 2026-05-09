# Disclosure

A complete, searchable, locally-mirrored archive of U.S. government UAP/UFO disclosure
documents — better than the government's own.

The Department of War (formerly DoD) launched a public UAP disclosure site at
[war.gov/UFO](https://www.war.gov/UFO/) on May 8, 2026 (PURSUE — Presidential Unsealing
and Reporting System for UAP Encounters). Releases land in tranches every few weeks.
This project mirrors every released file, extracts metadata + searchable text, and
classifies findings by significance.

## Layout

```
apps/
  downloader/   Fetches manifest CSV + every linked file from war.gov + DVIDS
  indexer/      Decrypts PDFs, extracts metadata + text (incl. OCR), populates FTS5
  classifier/   Applies keyword + metadata rules, writes per-record findings to user_record_meta
  web/          (later) The public-facing site
packages/
  shared/       (later) Shared TypeScript types
data/           Local mirror — gitignored. SQLite DB + downloaded files + manifest snapshots
docs/
  SCHEMA.md     Database schema + change-detection design
```

## Prereqs

**System:**
- macOS (currently — the headed-Chrome bypass uses `/Applications/Google Chrome.app`)
- [Homebrew](https://brew.sh/)
- Google Chrome (real install, not Chromium) — we drive a visible Chrome window
  through Playwright because Akamai blocks every other client on war.gov

**Node toolchain:**
- Node 20.19+ (see `.nvmrc`)
- pnpm 9+

**CLI binaries** (used by the indexer; install once via Homebrew):
```sh
brew install poppler qpdf tesseract
```
- `poppler` provides `pdfinfo`, `pdftotext`, `pdftoppm`
- `qpdf` decrypts soft-encrypted gov PDFs (the gov ships them with `print:yes copy:no`)
- `tesseract` OCRs scanned PDFs

`exiftool` is bundled via npm (`exiftool-vendored`); no system install needed.

## First-time setup

```sh
pnpm install
```

That's it. No `playwright install` needed — we use the user's installed Chrome via `channel: 'chrome'`.

## Running

**Pull a fresh release end-to-end** — download every file, decrypt + index + OCR, then classify:

```sh
pnpm refresh
```

A Chrome window will open briefly to navigate war.gov/UFO/ (Akamai challenge),
then close once the manifest fetch is authenticated. Files stream to `./data/files/`
while the orchestrator runs. The full pass on a fresh corpus takes ~5 min for download,
~60 min for OCR, <1 sec for classification. Subsequent runs are idempotent and fast
(seconds when nothing has changed; minutes for incremental new files).

**Step-by-step** (for debugging or partial runs):

```sh
pnpm download             # downloader only — fetch manifest + files
pnpm index                # indexer with OCR (slow on scans)
pnpm index:fast           # indexer without OCR — text-layer + metadata only
pnpm classify             # apply keyword rules; writes findings to user_record_meta
```

**Smoke-testing one app:**

```sh
pnpm --filter @disclosure/downloader run dev --limit 5
pnpm --filter @disclosure/indexer    run dev --kind pdf --limit 5
pnpm --filter @disclosure/classifier run dev --record 19
```

## Re-running on a new release

When DoW posts Release 02:

1. Add a new entry to `RELEASES` in `apps/downloader/src/config.ts` with the new
   slug and manifest URL.
2. `pnpm refresh`.

The downloader will:
- Hash the new manifest CSV against the last snapshot — only re-parses if changed.
- Issue conditional GETs (`If-None-Match` / `If-Modified-Since`) — server replies 304
  on unchanged files, no bytes pulled.
- Only new/changed/missing files actually download.

The indexer skips PDFs whose `pre_decrypt_sha256` is already set (already decrypted)
and re-extracts metadata + text on the rest. The classifier always re-classifies (cheap)
and respects any record where the user has set `user_overridden: true` in
`user_record_meta`.

## Schema

See [docs/SCHEMA.md](docs/SCHEMA.md). Three layers in one SQLite DB:

- **Gov** — mirrored from war.gov + DVIDS (`release`, `record`, `file`, `manifest_snapshot`).
- **Indexer output** — `file_metadata`, `file_text`, FTS5 virtual table.
- **User-owned** — `user_tag`, `user_record_tag`, `user_record_note`, `user_record_meta`.
  The downloader and indexer never write here; the classifier writes auto-classifications
  but skips rows the user has marked as `user_overridden`.
