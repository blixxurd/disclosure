import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// packages/shared/src/  →  monorepo root is three levels up.
export const REPO_ROOT = resolve(here, '../../..');
export const DATA_ROOT = resolve(REPO_ROOT, 'data');
export const DB_PATH = resolve(DATA_ROOT, 'disclosure.db');
export const MANIFESTS_DIR = resolve(DATA_ROOT, 'manifests');
export const FILES_DIR = resolve(DATA_ROOT, 'files');
export const LOGS_DIR = resolve(DATA_ROOT, 'logs');
