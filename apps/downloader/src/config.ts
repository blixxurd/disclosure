import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// apps/downloader/src/  →  monorepo root is three levels up
export const REPO_ROOT = resolve(here, '../../..');
export const DATA_ROOT = resolve(REPO_ROOT, 'data');
export const DB_PATH = resolve(DATA_ROOT, 'disclosure.db');
export const MANIFESTS_DIR = resolve(DATA_ROOT, 'manifests');
export const FILES_DIR = resolve(DATA_ROOT, 'files');
export const LOGS_DIR = resolve(DATA_ROOT, 'logs');

export interface ReleaseConfig {
  slug: string;
  name: string;
  sourceUrl: string;
  manifestUrl: string;
}

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
