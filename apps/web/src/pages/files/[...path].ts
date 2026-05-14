// Streams files from the local data/files/ mirror to the browser.
// Astro's static asset middleware doesn't reach outside the project dir, so
// we serve them via this dynamic route. Reads are bounded to data/files/
// (path traversal protection) and use Range headers for video seek.

import type { APIRoute } from 'astro';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';

const here = dirname(fileURLToPath(import.meta.url));
// apps/web/src/pages/files/  →  monorepo root is five levels up
const DATA_FILES = resolve(here, '../../../../..', 'data/files');

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

export const GET: APIRoute = ({ params, request }) => {
  const rawPath = params.path;
  if (!rawPath || typeof rawPath !== 'string') {
    return new Response('bad path', { status: 400 });
  }

  // Normalize and refuse anything that escapes the data/files/ root.
  const filePath = normalize(resolve(DATA_FILES, rawPath));
  if (!filePath.startsWith(DATA_FILES + '/')) {
    return new Response('forbidden', { status: 403 });
  }
  if (!existsSync(filePath)) {
    return new Response('not found', { status: 404 });
  }

  const stat = statSync(filePath);
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  const contentType = MIME[ext] ?? 'application/octet-stream';

  // Range requests (essential for video seek on iOS Safari).
  const range = request.headers.get('range');
  if (range) {
    const match = /bytes=(\d+)-(\d+)?/.exec(range);
    if (match) {
      const start = parseInt(match[1]!, 10);
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      const nodeStream = createReadStream(filePath, { start, end });
      return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }
  }

  const nodeStream = createReadStream(filePath);
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
