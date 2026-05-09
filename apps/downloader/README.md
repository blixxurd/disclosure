# @disclosure/downloader

Mirrors the Department of War's UAP/UFO disclosure corpus to local disk and
indexes it in SQLite. This is the **first** app in the pipeline; the indexer
and classifier read what it produces.

## What it does

Per release (Release 01 today, Release 02+ as they land):

1. Launches a real Chrome window via Playwright and navigates to
   `https://www.war.gov/UFO/`. This passes the Akamai bot challenge that
   blocks every other client (curl, headless Chromium, Node `fetch`).
2. Once authenticated, fetches the manifest CSV at
   `https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-csv.csv`.
3. Hashes the bytes against the last `manifest_snapshot` in SQLite. If
   unchanged, skips parsing and falls through to file-integrity checks.
4. Otherwise: archives the raw CSV under `data/manifests/{release}/`,
   parses with papaparse, dedupes the gov's exact-duplicate rows
   (e.g. D32 listed three times), and upserts records into SQLite.
5. For every record, downloads the linked PDF/image/thumbnail/video to
   `data/files/{release}/{kind}/{filename}` — using `Referer` headers
   (Akamai requires them on thumbnails) and `If-Modified-Since` /
   `If-None-Match` on re-runs.
6. DVIDS-hosted videos are resolved through `src/dvids.ts`: fetch the
   public DVIDS page, regex out the inline `<source src=...mp4>`
   CloudFront URL, cache it on `file.resolved_url`, then download.

## Why a headed Chrome window opens

Akamai 403s every variant of curl, Node fetch, headless Playwright,
`channel: 'chrome'` headless, and bundled chromium-headless-shell. The only
configuration that passes — verified by trial — is real Chrome with
`headless: false`. The window stays visible for ~10–20 seconds while the
JS challenge clears, then `APIRequestContext.get(...)` reuses the resulting
cookies for fast bulk downloads without spinning up new pages.

If you're SSH'd in or running headless, this app won't work as-is. There's
no fix on the roadmap; future Chromium-stealth approaches are an open
question, not a planned change.

## Run it

```sh
pnpm --filter @disclosure/downloader run dev                  # full release pull
pnpm --filter @disclosure/downloader run dev --dry-run        # sync manifest, no downloads
pnpm --filter @disclosure/downloader run dev --limit 5        # smoke test
pnpm --filter @disclosure/downloader run dev --source dvids   # only DVIDS videos
pnpm --filter @disclosure/downloader run dev --release release_1
```

## Adding a new release

When DoW posts Release 02:

1. Edit `src/config.ts` and append to `RELEASES`:
   ```ts
   {
     slug: 'release_2',
     name: 'Release 02',
     sourceUrl: 'https://www.war.gov/UFO/',
     manifestUrl: 'https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-csv.csv',
     // …or the new manifest URL if they version it
   }
   ```
2. From repo root: `pnpm refresh`. The downloader will pick up the new
   release entry, fetch its manifest, and download only the new files.

If DoW changes the page structure (e.g. moves the CSV path, introduces
authentication, adds CAPTCHAs), this app will need source-level changes —
not just a config edit. The selectors live in `src/browser.ts` and the
URL pattern lives in `src/manifest.ts`.

## Layout

```
src/
├── index.ts        # CLI entry — argument parsing
├── run.ts          # orchestrator: per-release loop + concurrency
├── browser.ts      # Playwright session manager (real Chrome)
├── manifest.ts     # CSV fetch + papaparse + record/file derivation
├── download.ts     # streaming download w/ conditional GET + atomic write
├── dvids.ts        # DVIDS video page scraper → CloudFront mp4 URL
└── config.ts       # downloader-specific config (RELEASES, concurrency, timeouts)
```

Shared infrastructure — `Db` class, migrations, logger, util helpers, path
constants — lives in `@disclosure/shared` (see `packages/shared/`).

## Idempotency

Re-running on an unchanged corpus does:

- 1 manifest fetch (~200 KB)
- 0 record/file parses (manifest hash matched)
- N conditional GETs where N = file count (304 responses, no bytes)
- 0 disk writes

Total: a few seconds. The `--limit` flag is just for smoke tests; production
runs always use the full set.

When something *has* changed:

- New manifest hash → snapshot saved, all rows re-upserted.
- A previously-seen `natural_key` with a different `content_sha256` → `record`
  row updated, `last_seen_at` bumped.
- A natural_key absent from the new manifest → `removed_at = now()` (tombstone,
  not delete; user annotations and local files survive).
- A file whose recorded sha256 doesn't match what's on disk → re-downloaded.

## Troubleshooting

**`HTTP 403`** from the initial page navigation: Akamai rejected the
session. Common causes:
- VPN or non-US IP — try without.
- Chrome version too old.
- Real Chrome not at `/Applications/Google Chrome.app` (we set
  `channel: 'chrome'` which expects the standard install path).

**`HTTP 403` only on thumbnails**: missing Referer header. We send
`Referer: <release.sourceUrl>` on every request now; if you see this
again, Akamai changed something.

**`spawn dvids ENOENT`** or similar from the DVIDS resolver: those go
through Node's `fetch` over Playwright's request context — no system
binary required. If it appears anyway, check that the video's DVIDS
page hasn't changed structure (regex in `src/dvids.ts`).

**Persistent download failures**: `file.fetch_attempts` and
`file.fetch_error` are recorded per file; query the DB to see which
files keep failing and why. Files with non-fatal errors get retried on
every run.

## Output destinations

- `data/disclosure.db` — SQLite (created on first run, migrated automatically)
- `data/files/{release}/{pdfs,images,thumbnails,videos}/...` — file bytes
- `data/manifests/{release}/{ISO-timestamp}.csv` — raw CSV snapshots, kept forever
- `data/logs/{YYYY-MM-DD}.log` — JSON-lines log per UTC date
