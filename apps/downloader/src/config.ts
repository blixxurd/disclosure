// Downloader-specific configuration. Path constants live in @disclosure/shared/config.
import type { ReleaseConfig } from '@disclosure/shared/db';

export const RELEASES: ReleaseConfig[] = [
  {
    slug: 'release_1',
    name: 'Release 01',
    sourceUrl: 'https://www.war.gov/UFO/',
    manifestUrl: 'https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-csv.csv',
  },
];

export const DOWNLOAD_CONCURRENCY = 4;
export const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
export const NAV_TIMEOUT_MS = 60_000;
