import { describe, it, expect } from 'vitest';
import { parseManifest } from '../manifest.js';

// Header matches the live war.gov CSV (Release 02 era): 14 base columns +
// the two new Release-02 additions (Image Alt Text, Image VIRIN) + the
// trailing padding columns gov ships.
const HEADER =
  'Redaction,Release Date,Title,Type,Video Pairing,PDF Pairing,Description Blurb,DVIDS Video ID,Video Title,Agency,Incident Date,Incident Location,PDF | Image Link,Modal Image,Image Alt Text,Image VIRIN,,,,,,,,,,,,';

// Default to a Release 01 row (5/8/26). Override `releaseDate` for Release 02.
function row(opts: {
  title: string;
  type: string;
  link?: string;
  modal?: string;
  dvids?: string;
  agency?: string;
  desc?: string;
  pdfPairing?: string;
  releaseDate?: string;
  imageAlt?: string;
  imageVirin?: string;
}): string {
  return [
    '', // Redaction
    opts.releaseDate ?? '5/8/26',
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
    `"${opts.imageAlt ?? ''}"`,
    opts.imageVirin ?? '',
  ].join(',') + ',,,,,,,,,,,,';
}

describe('parseManifest', () => {
  it('strips a UTF-8 BOM at the start of the file', () => {
    const csv =
      '﻿' +
      HEADER +
      '\n' +
      row({ title: 'BOM Test', type: 'PDF', link: 'https://example.com/foo.pdf' });
    const records = parseManifest(csv);
    expect(records).toHaveLength(1);
    expect(records[0]?.title).toBe('BOM Test');
  });

  it('normalizes type field with trailing whitespace ("PDF " → "PDF")', () => {
    const csv =
      HEADER +
      '\n' +
      row({ title: 'Trailing', type: '"PDF "', link: 'https://example.com/ok.pdf' });
    const records = parseManifest(csv);
    expect(records).toHaveLength(1);
    expect(records[0]?.primary_type).toBe('PDF');
  });

  it('accepts AUD as a primary_type (NASA Apollo/Gemini audio)', () => {
    const csv =
      HEADER +
      '\n' +
      row({
        title: 'NASA-UAP-D008, Apollo 12 Medical Debriefing - Tape 12, 1969',
        type: 'AUD',
        dvids: '1007870',
        agency: 'NASA',
        releaseDate: '5/22/26',
      });
    const records = parseManifest(csv);
    expect(records).toHaveLength(1);
    expect(records[0]?.primary_type).toBe('AUD');
    // AUD rows are DVIDS-hosted, like VID; no war.gov files.
    const sources = records[0]?.files.map((f) => f.source_system);
    expect(sources).toEqual(['dvids']);
  });

  it('assigns release_slug=release_1 to rows dated 5/8/26', () => {
    const csv =
      HEADER +
      '\n' +
      row({ title: 'R01 row', type: 'PDF', link: 'https://example.com/r01.pdf' });
    const [r] = parseManifest(csv);
    expect(r?.release_slug).toBe('release_1');
    expect(r?.release_name).toBe('Release 01');
  });

  it('assigns release_slug=release_02 to rows dated 5/22/26', () => {
    const csv =
      HEADER +
      '\n' +
      row({
        title: 'R02 row',
        type: 'PDF',
        link: 'https://www.war.gov/medialink/ufo/052226/release_02/documents/DOW-UAP-D017.pdf',
        releaseDate: '5/22/26',
      });
    const [r] = parseManifest(csv);
    expect(r?.release_slug).toBe('release_02');
    expect(r?.release_name).toBe('Release 02');
  });

  it('skips rows whose Release Date is not in the release map', () => {
    const csv =
      HEADER +
      '\n' +
      row({ title: 'Future row', type: 'PDF', link: 'https://x/y.pdf', releaseDate: '6/15/26' });
    expect(parseManifest(csv)).toHaveLength(0);
  });

  it('dedupes byte-identical duplicate rows the gov ships', () => {
    const dupRow = row({
      title: 'DOW-UAP-D32, Mission Report, Syria, October 2024',
      type: 'PDF',
      link: 'https://example.com/dow-uap-d32-mission-report,-syria-october-2024.pdf',
    });
    const csv = HEADER + '\n' + dupRow + '\n' + dupRow + '\n' + dupRow;
    const records = parseManifest(csv);
    expect(records).toHaveLength(1);
  });

  it('derives natural_key from PDF | Image Link slug', () => {
    const csv =
      HEADER +
      '\n' +
      row({ title: 'X', type: 'PDF', link: 'https://example.com/path/My-PDF-Slug.PDF' });
    const [r] = parseManifest(csv);
    expect(r?.natural_key).toBe('release_1::my-pdf-slug');
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
    const [r] = parseManifest(csv);
    expect(r?.natural_key).toBe('release_1::dvids:1006056');
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
    const [r] = parseManifest(csv);
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
    const [r] = parseManifest(csv);
    const sources = r?.files.map((f) => f.source_system);
    expect(sources).toEqual(['dvids']);
  });

  it('emits a DVIDS placeholder file row whenever dvids id is set', () => {
    const csv =
      HEADER +
      '\n' +
      row({ title: 'V', type: 'VID', dvids: '999' });
    const [r] = parseManifest(csv);
    const dv = r?.files.find((f) => f.source_system === 'dvids');
    expect(dv?.source_url).toBe('https://www.dvidshub.net/video/999');
    expect(dv?.kind).toBe('video');
  });

  it('skips rows with no title', () => {
    const csv = HEADER + '\n,5/8/26,,PDF,,,,,,,,,,,,,,,,,,,,,,,,';
    expect(parseManifest(csv)).toHaveLength(0);
  });
});
