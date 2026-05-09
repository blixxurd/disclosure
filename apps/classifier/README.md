# @disclosure/classifier

Walks the indexed corpus, applies keyword + metadata rules, and writes per-record
classifications (tier + themes + findings) into `user_record_meta`. Run
*after* the indexer.

This is the analysis layer — the part where "what we found" stops being
metadata and starts being judgment.

## The 5-tier system

| Tier | Name | Definition |
|---|---|---|
| **T1** | Smoking gun | Primary-source US government document, in its own internal voice, making an extraordinary claim. The State cable saying *"OBJECT WAS EXTRATERRESTRIAL AND UNDER INTELLIGENT CONTROL"*. The 1947 FBI section debating *"the possibility that extraterrestrial animals were flying into our atmosphere"*. |
| **T2** | Strong signal | Direct evidence of a coordinated program, pattern, or institutional behavior. Project Mogul-era cover-story tracking. The Mission Reports' formal *"UAP Anomalous Characteristics/Behaviors"* form field. |
| **T3** | Notable / forensic | Provenance clue from metadata. Apollo "anomalous lights" images carrying Adobe Illustrator vector overlays. The PowerPoint deck created on release morning. Soft-encrypted (`copy:no`) PDFs. The 3 corrupted Mission Reports. |
| **T4** | Historical canon | Material documenting well-known cases (Maury Island, Roswell, Project Blue Book, Apollo astronaut sightings). |
| **T5** | Adjacent / context | Tangential material swept into the disclosure (launch reliability reports, satellite catalogs) plus records with no rule matches. |

A record's headline tier is the **highest** tier among its findings.

## Themes (cross-cutting tags)

A finding can carry one or more themes; a record's theme set is the union
across its findings.

- `explicit-et` — doc literally invokes ET / non-human as a hypothesis
- `cover-story` — public-narrative management evidence (Mogul, Bennewicz, Aviary, Doty)
- `anomaly-class` — formal classification of UAP behavior as anomalous
- `material-recovery` — physical fragments, debris, wreckage, "metallic"
- `astronaut-obs` — NASA/space-program observations
- `intl-tracking` — US monitoring of foreign UAP discourse (cables, embassies)
- `provenance` — software/scanner/edit trail in metadata
- `pre-disclosure-age` — created before 2024
- `redaction-artifact` — soft-encrypted PDFs, malformed docs, sloppy redaction
- `historical-canon` — classic cases
- `curation-absence` — notable thing missing (currently unused; reserved for cross-corpus findings)

## Rule types

Two formats live in `src/keywords.ts`:

**Text rules** match against `file_text_fts` using FTS5 query syntax. Use
quotes for phrases:

```ts
{ id: 't1-extraterrestrial', tier: 'T1', themes: ['explicit-et'],
  fts: 'extraterrestrial', label: 'Primary text invokes "extraterrestrial"' }
```

**Metadata rules** match against `file_metadata` columns via raw SQL `WHERE`
clauses (joined to `file`):

```ts
{ id: 't3-illustrator', tier: 'T3', themes: ['provenance'],
  where: `(fm.exif_software LIKE '%Illustrator%' OR fm.pdf_creator LIKE '%Illustrator%')`,
  label: 'Touched by Adobe Illustrator (vector overlay added)' }
```

Each rule fires on every matching file; per-record findings dedupe by
`(rule_id, file_id)`.

## Run it

```sh
pnpm --filter @disclosure/classifier run dev               # standard run
pnpm --filter @disclosure/classifier run dev --force       # overwrite even user-overridden classifications
pnpm --filter @disclosure/classifier run dev --record 19   # debug a single record
```

Takes <1 second on Release 01's 158 records.

## How to add or edit a rule

1. Open `src/keywords.ts`.
2. For a text rule, add to `TEXT_RULES`. For a metadata rule, add to
   `METADATA_RULES`. Pick a stable `id` — it's persisted into
   `user_record_meta.value` and used to suppress dups across re-runs.
3. Run `pnpm --filter @disclosure/classifier run dev` and inspect the
   tier histogram in the log. Investigate any unexpected hits with FTS
   directly:
   ```sh
   sqlite3 data/disclosure.db "SELECT f.id, snippet(file_text_fts, 0, '<<', '>>', '...', 12)
                                  FROM file_text_fts JOIN file f ON f.id=file_text_fts.rowid
                                 WHERE file_text_fts MATCH 'YOUR_QUERY' LIMIT 5"
   ```
4. Tighten any rule that's producing OCR-stemming false positives. The
   FTS5 porter tokenizer treats `EBE`, `eb`, `EB.` all as the same token —
   use phrase queries (`"Extraterrestrial Biological"`) when in doubt.

## How user overrides work

If you manually edit a record's `user_record_meta` entry (key `classification`)
and set `user_overridden: true` in the JSON value, the classifier will
**skip** that record on subsequent runs. Pass `--force` to bypass.

This lets analysts hand-curate findings without their work being clobbered
by a reclassification pass. Future webapp UIs will write `user_overridden`
when an analyst manually changes a tier or theme.

## Sample queries

```sql
-- All T1 records:
SELECT r.id, r.title, json_extract(urm.value, '$.themes') AS themes
FROM record r JOIN user_record_meta urm ON urm.record_id = r.id
WHERE urm.key = 'classification' AND json_extract(urm.value, '$.tier') = 'T1';

-- Tier histogram:
SELECT json_extract(value, '$.tier') AS tier, COUNT(*) AS n
FROM user_record_meta WHERE key = 'classification' GROUP BY tier ORDER BY tier;

-- Records tagged with a theme:
SELECT r.id, r.title FROM record r
JOIN user_record_meta urm ON urm.record_id = r.id
WHERE urm.key='classification'
  AND EXISTS (SELECT 1 FROM json_each(urm.value, '$.themes') WHERE value = 'cover-story');

-- Findings on a specific record:
SELECT json_extract(finding.value, '$.rule_id'),
       json_extract(finding.value, '$.label'),
       json_extract(finding.value, '$.snippet')
FROM user_record_meta urm, json_each(urm.value, '$.findings') AS finding
WHERE urm.record_id = 19 AND urm.key = 'classification';
```

## Layout

```
src/
├── index.ts       # CLI — flags: --force --record
├── run.ts         # orchestrator: applies all rules, computes per-record tier+themes
├── keywords.ts    # the rule spec (TEXT_RULES + METADATA_RULES)
└── log.ts
```

No state of its own — reads from the indexer's tables, writes to
`user_record_meta`. Re-runnable without consequence (modulo the
`user_overridden` skip).

## Open question: cross-corpus findings

Some "findings" don't attach to a single record — e.g. *"the Tic Tac /
Gimbal / Go Fast videos are absent from this release"* is a fact about
the whole corpus. There's no record_id to attach it to. The
`curation-absence` theme is reserved for these but no schema yet.

Likely future addition: a top-level `corpus_findings` table or a
sentinel record (`record_id = 0`) that holds release-wide observations.
Defer until the webapp shape demands it.
