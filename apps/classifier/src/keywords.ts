// Disclosure classifier — keyword & metadata rules.
//
// Two rule types:
//   1. text rules — match against file_text via FTS5 query syntax
//   2. metadata rules — predicate on file_metadata columns
//
// Each rule contributes a finding to its file's record at a given tier.
// A record's headline tier is the *highest* tier among its findings.
// (T1 > T2 > T3 > T4 > T5.)

export type Tier = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export type Theme =
  | 'explicit-et'
  | 'cover-story'
  | 'anomaly-class'
  | 'material-recovery'
  | 'astronaut-obs'
  | 'intl-tracking'
  | 'provenance'
  | 'pre-disclosure-age'
  | 'redaction-artifact'
  | 'historical-canon'
  | 'curation-absence';

export interface TextRule {
  id: string;
  tier: Tier;
  themes: Theme[];
  /** FTS5 query expression. Use quotes for phrases: '"intelligent control"'. */
  fts: string;
  /** Human-readable rationale for the match (shown in UI). */
  label: string;
}

export interface MetadataRule {
  id: string;
  tier: Tier;
  themes: Theme[];
  /** Raw SQL WHERE clause appended to a base query joining file + file_metadata. */
  where: string;
  label: string;
}

// ── T1: Smoking gun — primary-source US gov language for extraordinary claims
export const TEXT_RULES: TextRule[] = [
  {
    id: 't1-extraterrestrial',
    tier: 'T1',
    themes: ['explicit-et'],
    fts: 'extraterrestrial',
    label: 'Primary text invokes "extraterrestrial"',
  },
  {
    id: 't1-non-human',
    tier: 'T1',
    themes: ['explicit-et'],
    fts: '"non-human"',
    label: 'Primary text uses "non-human"',
  },
  {
    id: 't1-ebe',
    tier: 'T1',
    themes: ['explicit-et'],
    // The bare "EBE" token false-positives wildly on OCR'd typewriter text
    // (e.g. matches "eB", "EB.", initials like "Frank E.B."). Require the
    // explicit phrase to anchor the match.
    fts: '"Extraterrestrial Biological"',
    label: 'EBE / Extraterrestrial Biological Entity reference',
  },

  // ── T2: Strong signal — programs, cover stories, formal anomaly classification
  {
    id: 't2-mogul',
    tier: 'T2',
    themes: ['cover-story'],
    fts: '"Project Mogul" OR "cosmic ray balloon" OR "weather balloon" OR Liddel',
    label: 'Project Mogul / cover-story narrative tracking',
  },
  {
    id: 't2-bennewicz',
    tier: 'T2',
    themes: ['cover-story'],
    fts: 'Bennewicz OR AFOSI OR Aviary OR Doty',
    label: 'Bennewicz / AFOSI disinformation campaign',
  },
  {
    id: 't2-disinformation',
    tier: 'T2',
    themes: ['cover-story'],
    fts: 'disinformation',
    label: 'Doc explicitly references disinformation',
  },
  {
    id: 't2-anomalous-chars',
    tier: 'T2',
    themes: ['anomaly-class'],
    fts: '"anomalous characteristics" OR "range fouler"',
    label: 'Formal UAP anomaly classification',
  },
  {
    id: 't2-intelligent-control',
    tier: 'T2',
    themes: ['anomaly-class'],
    // Form-template field on Mission Reports + occasional FBI mentions. The
    // form asks the question; the doc asserting it (e.g. State cables) gets
    // bumped to T1 via the t1-extraterrestrial rule, since those docs say
    // both "extraterrestrial" AND "intelligent control" together.
    fts: '"intelligent control"',
    label: 'Doc references "intelligent control" (form field or claim)',
  },
  {
    id: 't2-recovery',
    tier: 'T2',
    themes: ['material-recovery'],
    fts: 'fragments OR debris OR "polished metal" OR metallic OR wreckage',
    label: 'Material / debris references',
  },
  {
    id: 't2-flying-disc',
    tier: 'T2',
    themes: ['historical-canon', 'material-recovery'],
    fts: '"flying disc" OR "flying saucer" OR saucer',
    label: 'Classic 1947-wave terminology',
  },

  // ── T2/intl-tracking: US monitoring of foreign UAP discourse
  {
    id: 't2-maussan',
    tier: 'T2',
    themes: ['intl-tracking'],
    fts: 'Maussan',
    label: 'US tracking Maussan / Mexican Congress hearings',
  },
  {
    id: 't2-foreign-cables',
    tier: 'T2',
    themes: ['intl-tracking'],
    fts: 'embassy AND (Kazakhstan OR Tajikistan OR Turkmenistan OR Mexico OR "Papua New Guinea")',
    label: 'US embassy cable on foreign UAP report',
  },

  // ── T4: Historical canon
  {
    id: 't4-roswell',
    tier: 'T4',
    themes: ['historical-canon'],
    fts: 'Roswell',
    label: 'Roswell reference',
  },
  {
    id: 't4-maury-island',
    tier: 'T4',
    themes: ['historical-canon'],
    fts: '"Maury Island" OR (Maury AND (island OR Kelso OR McChord))',
    label: 'Maury Island incident',
  },
  {
    id: 't4-blue-book',
    tier: 'T4',
    themes: ['historical-canon'],
    fts: '"Project Blue Book" OR "Project Sign" OR "Project Grudge" OR "Project Twinkle"',
    label: 'Air Force UAP project',
  },
  {
    id: 't4-kenneth-arnold',
    tier: 'T4',
    themes: ['historical-canon'],
    fts: '"Kenneth Arnold" OR "Air Materiel Command" OR "Wright-Patterson"',
    label: 'Foundational 1947-era investigation',
  },
  {
    id: 't4-astronaut',
    tier: 'T4',
    themes: ['astronaut-obs'],
    fts: 'Apollo OR Skylab OR Gemini',
    label: 'Astronaut / space-program observation',
  },

  // ── T5: Adjacent / context (swept-in launch and satellite material)
  {
    id: 't5-launch',
    tier: 'T5',
    themes: [],
    fts: '"launch failure" OR "Atlas IIAS" OR Vandenberg OR "reentry system"',
    label: 'Launch / booster reliability material',
  },
  {
    id: 't5-cosmic-sat',
    tier: 'T5',
    themes: [],
    fts: 'COBE OR "Cosmic Ray Observation"',
    label: 'Satellite mission catalog (COBE / Cosmic Ray sats)',
  },
];

// Metadata rules — match against file_metadata columns + file timing.
// Predicates are appended to: SELECT f.id, f.record_id FROM file f JOIN file_metadata fm ON fm.file_id = f.id WHERE …
export const METADATA_RULES: MetadataRule[] = [
  {
    id: 't3-photoshop',
    tier: 'T3',
    themes: ['provenance'],
    where: `(fm.exif_software LIKE '%Photoshop%' OR fm.pdf_creator LIKE '%Photoshop%' OR fm.pdf_producer LIKE '%Photoshop%')`,
    label: 'Touched by Adobe Photoshop',
  },
  {
    id: 't3-illustrator',
    tier: 'T3',
    themes: ['provenance'],
    where: `(fm.exif_software LIKE '%Illustrator%' OR fm.pdf_creator LIKE '%Illustrator%')`,
    label: 'Touched by Adobe Illustrator (vector overlay added)',
  },
  {
    id: 't3-powerpoint',
    tier: 'T3',
    themes: ['provenance'],
    where: `(fm.pdf_creator LIKE '%PowerPoint%' OR fm.pdf_producer LIKE '%PowerPoint%')`,
    label: 'Built in Microsoft PowerPoint',
  },
  {
    id: 't3-paper-capture',
    tier: 'T3',
    themes: ['provenance'],
    where: `fm.pdf_producer LIKE '%Paper Capture%'`,
    label: 'OCR via Adobe Acrobat Paper Capture',
  },
  {
    id: 't3-vintage-scanner',
    tier: 'T3',
    themes: ['provenance'],
    where: `(fm.pdf_creator LIKE '%HP 9100C%' OR fm.pdf_creator LIKE '%ScanSnap%' OR fm.pdf_creator LIKE '%PaperStream%')`,
    label: 'Scanned on a known document scanner',
  },
  {
    id: 't3-quartz-merged',
    tier: 'T3',
    themes: ['provenance'],
    where: `fm.pdf_producer LIKE '%AppendMode%'`,
    label: 'Multiple PDFs merged on macOS Preview',
  },
  {
    id: 't3-pre-2024',
    tier: 'T3',
    themes: ['pre-disclosure-age'],
    where: `(fm.pdf_created_at IS NOT NULL AND
             CAST(SUBSTR(fm.pdf_created_at, INSTR(fm.pdf_created_at, ' 20') + 1, 4) AS INTEGER) > 0
             AND CAST(SUBSTR(fm.pdf_created_at, INSTR(fm.pdf_created_at, ' 20') + 1, 4) AS INTEGER) < 2024)`,
    label: 'PDF authored before 2024 (predates disclosure narrative)',
  },
  {
    id: 't3-soft-redacted',
    tier: 'T3',
    themes: ['redaction-artifact'],
    where: `(f.pre_decrypt_sha256 IS NOT NULL OR (fm.pdf_encrypted = 1 AND fm.pdf_permissions LIKE '%copy:no%'))`,
    label: 'Soft-redacted: shipped with copy disabled',
  },
  {
    id: 't3-corrupted',
    tier: 'T3',
    themes: ['redaction-artifact'],
    where: `(f.kind='pdf' AND fm.format='application/pdf' AND NOT EXISTS (SELECT 1 FROM file_text ft WHERE ft.file_id = f.id))`,
    label: 'PDF with no extractable text (potentially malformed or scan)',
  },
];
