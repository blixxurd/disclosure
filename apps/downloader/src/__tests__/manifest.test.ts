import { describe, it, expect } from 'vitest';
import type { ReleaseConfig } from '@disclosure/shared/db';
import { parseManifest } from '../manifest.js';

const RELEASE: ReleaseConfig = {
  slug: 'release_test',
  name: 'Test',
  sourceUrl: 'https://example.com/UFO/',
  manifestUrl: 'https://example.com/manifest.csv',
};

// Header matches the war.gov CSV exactly (including the trailing empty
// padding columns the gov ships). Most edge cases live in this fixture.
const HEADER =
  'Redaction,Release Date,Title,Type,Video Pairing,PDF Pairing,Description Blurb,DVIDS Video ID,Video Title,Agency,Incident Date,Incident Location,PDF | Image Link,Modal Image,,,,,,,,,,,,,';

function row(opts: {
  title: string;
  type: string;
  link?: string;
  modal?: string;
  dvids?: string;
  agency?: string;
  desc?: string;
  pdfPairing?: string;
}): string {
  return [
    '', // Redaction
    '5/8/26', // Release Date
    `"${opts.title}"`,
    opts.type,
    '', // Video Pairing
    opts.pdfPairing ?? '',
    `"${opts.desc ?? ''}"`,
    opts.dvids ?? '',
    '', // Video Title
    opts.agency ?? 'FBI',
    'N/A', // Incident Date
    'N/A', // Incident Location
    opts.link ?? '',
    opts.modal ?? '',
  ].join(',') + ',,,,,,,,,,,,,';
}

describe('parseManifest', () => {
  it('strips a UTF-8 BOM at the start of the file', () => {
    const csv =
      '﻿' +
      HEADER +
      '\n' +
      row({ title: 'BOM Test', type: 'PDF', link: 'https://example.com/foo.pdf' });
    const records = parseManifest(csv, RELEASE);
    expect(records).toHaveLength(1);
    expect(records[0]?.title).toBe('BOM Test');
  });

  it('normalizes type field with trailing whitespace ("PDF " → "PDF")', () => {
    const csv =
      HEADER +
      '\n' +
      row({ title: 'Trailing', type: '"PDF "', link: 'https://example.com/ok.pdf' });
    const records = parseManifest(csv, RELEASE);
    expect(records).toHaveLength(1);
    expect(records[0]?.primary_type).toBe('PDF');
  });

  it('dedupes byte-identical duplicate rows the gov ships', () => {
    const dupRow = row({
      title: 'DOW-UAP-D32, Mission Report, Syria, October 2024',
      type: 'PDF',
      link: 'https://example.com/dow-uap-d32-mission-report,-syria-october-2024.pdf',
    });
    const csv = HEADER + '\n' + dupRow + '\n' + dupRow + '\n' + dupRow;
    const records = parseManifest(csv, RELEASE);
    expect(records).toHaveLength(1);
  });

  it('derives natural_key from PDF | Image Link slug', () => {
    const csv =
      HEADER +
      '\n' +
      row({
        title: 'X',
        type: 'PDF',
        link: 'https://example.com/path/My-PDF-Slug.PDF',
      });
    const [r] = parseManifest(csv, RELEASE);
    expect(r?.natural_key).toBe('release_test::my-pdf-slug');
  });

  it('uses dvids:{id} as natural_key for VID rows even when a paired PDF link is present', () => {
    const csv =
      HEADER +
      '\n' +
      row({
        title: 'Video',
        type: 'VID',
        dvids: '1006056',
        // VID rows often carry a cross-reference to a paired PDF; that's not
        // their own file, so it should NOT drive natural_key.
        link: 'https://example.com/dow-uap-d10-mission-report-middle-east-may-2022.pdf',
        pdfPairing: 'DoW-UAP-D10',
      });
    const [r] = parseManifest(csv, RELEASE);
    expect(r?.natural_key).toBe('release_test::dvids:1006056');
  });

  it('produces a thumbnail file row when Modal Image is set', () => {
    const csv =
      HEADER +
      '\n' +
      row({
        title: 'X',
        type: 'PDF',
        link: 'https://example.com/foo.pdf',
        modal: 'https://example.com/thumbnail/foo.jpg',
      });
    const [r] = parseManifest(csv, RELEASE);
    const kinds = r?.files.map((f) => f.kind).sort();
    expect(kinds).toEqual(['pdf', 'thumbnail']);
  });

  it('does NOT include the cross-reference PDF link as a file of a VID record', () => {
    const csv =
      HEADER +
      '\n' +
      row({
        title: 'Video',
        type: 'VID',
        dvids: '1234',
        link: 'https://example.com/some-paired-mission.pdf',
        pdfPairing: 'DoW-UAP-D10',
      });
    const [r] = parseManifest(csv, RELEASE);
    const sources = r?.files.map((f) => f.source_system);
    expect(sources).toEqual(['dvids']);
  });

  it('emits a DVIDS placeholder file row whenever dvids id is set', () => {
    const csv =
      HEADER +
      '\n' +
      row({
        title: 'V',
        type: 'VID',
        dvids: '999',
      });
    const [r] = parseManifest(csv, RELEASE);
    const dv = r?.files.find((f) => f.source_system === 'dvids');
    expect(dv?.source_url).toBe('https://www.dvidshub.net/video/999');
    expect(dv?.kind).toBe('video');
  });

  it('skips rows with no title', () => {
    const csv = HEADER + '\n,5/8/26,,PDF,,,,,,,,,,,,,,,,,,,,,,,,';
    expect(parseManifest(csv, RELEASE)).toHaveLength(0);
  });
});
