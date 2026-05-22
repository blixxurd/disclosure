// Downloader-specific configuration. Path constants live in @disclosure/shared/config.
// Release metadata + manifest URL live in ./release-map.ts (single source of
// truth for the merged uap-data.csv and per-release-date mapping).

export const DOWNLOAD_CONCURRENCY = 4;
export const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
export const NAV_TIMEOUT_MS = 60_000;
