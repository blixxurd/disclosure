import { Db } from '../../downloader/src/db/index.js';
import { TEXT_RULES, METADATA_RULES, type Tier, type Theme } from './keywords.js';
import { log } from './log.js';

const TIER_RANK: Record<Tier, number> = { T1: 5, T2: 4, T3: 3, T4: 2, T5: 1 };

interface Finding {
  rule_id: string;
  tier: Tier;
  themes: Theme[];
  label: string;
  file_id: number | null;
  snippet: string | null;
  source: 'auto-keyword' | 'auto-metadata';
}

interface RecordClassification {
  tier: Tier;
  themes: Theme[];
  findings: Finding[];
  computed_at: string;
  user_overridden: false;
}

// Every record may have multiple files, each with multiple matches across
// rules. We collect all matches, group by record_id, then derive the headline
// tier (max) and union of themes.

export interface RunOptions {
  /** Re-classify even if user_overridden is set. */
  force?: boolean;
  /** Restrict to one record id (debugging). */
  onlyRecord?: number;
}

export async function runOnce(opts: RunOptions = {}): Promise<void> {
  const db = new Db();
  log.info('classifier starting', {
    text_rules: TEXT_RULES.length,
    metadata_rules: METADATA_RULES.length,
  });

  // record_id → Finding[]
  const findingsByRecord = new Map<number, Finding[]>();

  // ── Text (FTS) rules
  for (const rule of TEXT_RULES) {
    const rows = db.runQuery<{
      file_id: number;
      record_id: number;
      snippet: string;
    }>(
      `SELECT f.id AS file_id, f.record_id,
              snippet(file_text_fts, 0, '<<', '>>', '...', 12) AS snippet
         FROM file_text_fts
         JOIN file f ON f.id = file_text_fts.rowid
        WHERE file_text_fts MATCH ?`,
      [rule.fts],
    );
    log.info('text rule', { id: rule.id, tier: rule.tier, hits: rows.length });
    for (const row of rows) {
      const finding: Finding = {
        rule_id: rule.id,
        tier: rule.tier,
        themes: rule.themes,
        label: rule.label,
        file_id: row.file_id,
        snippet: row.snippet,
        source: 'auto-keyword',
      };
      pushFinding(findingsByRecord, row.record_id, finding);
    }
  }

  // ── Metadata rules
  for (const rule of METADATA_RULES) {
    const rows = db.runQuery<{ file_id: number; record_id: number }>(
      `SELECT f.id AS file_id, f.record_id
         FROM file f
         JOIN file_metadata fm ON fm.file_id = f.id
        WHERE ${rule.where}`,
    );
    log.info('metadata rule', { id: rule.id, tier: rule.tier, hits: rows.length });
    for (const row of rows) {
      const finding: Finding = {
        rule_id: rule.id,
        tier: rule.tier,
        themes: rule.themes,
        label: rule.label,
        file_id: row.file_id,
        snippet: null,
        source: 'auto-metadata',
      };
      pushFinding(findingsByRecord, row.record_id, finding);
    }
  }

  // ── Persist per record
  let written = 0;
  let skipped_user = 0;
  let unchanged = 0;
  const tierHist: Record<Tier, number> = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };

  for (const [recordId, findings] of findingsByRecord) {
    if (opts.onlyRecord && recordId !== opts.onlyRecord) continue;

    const existing = db.getUserRecordMeta(recordId, 'classification');
    if (existing && !opts.force) {
      try {
        const parsed = JSON.parse(existing.value) as { user_overridden?: boolean };
        if (parsed.user_overridden) {
          skipped_user++;
          continue;
        }
      } catch {
        // bad JSON; we'll overwrite.
      }
    }

    const headlineTier = findings
      .map((f) => f.tier)
      .sort((a, b) => TIER_RANK[b] - TIER_RANK[a])[0]!;
    const themes = Array.from(new Set(findings.flatMap((f) => f.themes))) as Theme[];

    const cls: RecordClassification = {
      tier: headlineTier,
      themes,
      findings,
      computed_at: new Date().toISOString(),
      user_overridden: false,
    };
    const json = JSON.stringify(cls);

    if (existing && existing.value === json) {
      unchanged++;
    } else {
      db.upsertUserRecordMeta(recordId, 'classification', json);
      written++;
    }
    tierHist[headlineTier]++;
  }

  // ── Records with NO findings: tag them as T5/'unclassified' so the webapp
  // has a uniform shape. Skip if user-overridden.
  const allRecords = db.listAllRecords();
  for (const r of allRecords) {
    if (findingsByRecord.has(r.id)) continue;
    const existing = db.getUserRecordMeta(r.id, 'classification');
    if (existing) {
      try {
        const parsed = JSON.parse(existing.value) as { user_overridden?: boolean };
        if (parsed.user_overridden) continue;
      } catch { /* overwrite */ }
    }
    const cls: RecordClassification = {
      tier: 'T5',
      themes: [],
      findings: [],
      computed_at: new Date().toISOString(),
      user_overridden: false,
    };
    db.upsertUserRecordMeta(r.id, 'classification', JSON.stringify(cls));
    written++;
    tierHist.T5++;
  }

  db.close();
  log.info('classifier complete', {
    written,
    skipped_user,
    unchanged,
    tier_histogram: tierHist,
  });
}

function pushFinding(
  map: Map<number, Finding[]>,
  recordId: number,
  finding: Finding,
): void {
  const list = map.get(recordId) ?? [];
  // Dedup by (rule_id, file_id) — a rule can fire on multiple files of one record
  // and we want each file's evidence captured, but not duplicate identical pairs.
  const key = `${finding.rule_id}|${finding.file_id}`;
  if (!list.some((f) => `${f.rule_id}|${f.file_id}` === key)) {
    list.push(finding);
  }
  map.set(recordId, list);
}
