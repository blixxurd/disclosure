// Maps a CSV "Release Date" value to a release slug + metadata.
//
// War.gov ships one merged uap-data.csv with rows from every release. The
// Release Date column is the discriminator. Each new tranche is one
// addition to RELEASE_BY_DATE.
//
// Slugs match war.gov's own URL convention exactly — note the inconsistency
// between release_1 (no zero-pad) and release_02 (zero-padded). We mirror
// it verbatim so asset URL substrings match.
import type { ReleaseConfig } from '@disclosure/shared/db';
import { createLogger } from '@disclosure/shared/log';

const log = createLogger('');

const SOURCE_URL = 'https://www.war.gov/UFO/';
const MANIFEST_URL = 'https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-data.csv';

const RELEASE_BY_DATE: Record<string, { slug: string; name: string }> = {
  '5/8/26':  { slug: 'release_1',  name: 'Release 01' },
  '5/22/26': { slug: 'release_02', name: 'Release 02' },
};

export function inferReleaseFromDate(releaseDate: string | null): ReleaseConfig | null {
  if (!releaseDate) return null;
  const hit = RELEASE_BY_DATE[releaseDate.trim()];
  if (!hit) {
    log.warn('unknown Release Date — row will be skipped', { releaseDate });
    return null;
  }
  return {
    slug: hit.slug,
    name: hit.name,
    sourceUrl: SOURCE_URL,
    manifestUrl: MANIFEST_URL,
  };
}

export function allKnownReleaseSlugs(): string[] {
  return Object.values(RELEASE_BY_DATE).map((r) => r.slug);
}

export function allKnownReleaseConfigs(): ReleaseConfig[] {
  return Object.values(RELEASE_BY_DATE).map((r) => ({
    slug: r.slug,
    name: r.name,
    sourceUrl: SOURCE_URL,
    manifestUrl: MANIFEST_URL,
  }));
}

export { SOURCE_URL, MANIFEST_URL };
