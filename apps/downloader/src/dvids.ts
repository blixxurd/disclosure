import type { APIRequestContext } from 'playwright';
import { log } from './log.js';

// dvidshub.net public video pages embed the playback mp4 in a <source> tag.
// The URL points at CloudFront (no auth) and matches a stable per-asset path.
// Example:
//   <source src="https://d34w7g4gy10iej.cloudfront.net/video/2605/DOD_111689232/DOD_111689232.mp4" type='video/mp4; ...'>
const MP4_TAG_RE =
  /<source[^>]+src=["']([^"']*cloudfront\.net\/video\/[^"']+\.mp4)["'][^>]*type=['"]video\/mp4/i;

export interface DvidsResolution {
  /** CloudFront URL — what we actually download. Subject to rotation. */
  mp4Url: string;
  /** Filename portion from the resolved URL (e.g. DOD_111689232.mp4). */
  filename: string;
}

/**
 * Resolve a DVIDS video ID (e.g. "1006119") to its CloudFront mp4 URL.
 * Throws on any failure — caller decides whether to mark the file errored.
 */
export async function resolveDvidsVideo(
  request: APIRequestContext,
  videoId: string,
): Promise<DvidsResolution> {
  const pageUrl = `https://www.dvidshub.net/video/${videoId}`;
  const resp = await request.get(pageUrl, {
    timeout: 30_000,
    // DVIDS public pages don't require any special headers; default Playwright UA works.
  });
  if (resp.status() !== 200) {
    throw new Error(`dvids page returned HTTP ${resp.status()} for video ${videoId}`);
  }
  const html = await resp.text();
  const match = MP4_TAG_RE.exec(html);
  if (!match || !match[1]) {
    throw new Error(`no mp4 <source> found on dvids video page ${videoId}`);
  }
  const mp4Url = match[1];
  const filename = mp4Url.split('/').pop()!;
  log.debug('resolved dvids video', { videoId, mp4Url });
  return { mp4Url, filename };
}
