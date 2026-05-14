// View-model types for the webapp. Built up from the shared Db row types
// by enriching with classification + file metadata.

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

export interface Finding {
  rule_id: string;
  tier: Tier;
  themes: Theme[];
  label: string;
  file_id: number | null;
  snippet: string | null;
  source: 'auto-keyword' | 'auto-metadata';
}

export interface Classification {
  tier: Tier;
  themes: Theme[];
  findings: Finding[];
  computed_at: string;
  user_overridden: boolean;
}

export interface RecordSummary {
  id: number;
  natural_key: string;
  title: string | null;
  agency: string | null;
  primary_type: string | null;
  release_date: string | null;
  incident_date: string | null;
  incident_loc: string | null;
  classification: Classification | null;
  thumbnail_path: string | null;
  pdf_path: string | null;
  video_path: string | null;
}

export interface RecordDetail extends RecordSummary {
  description: string | null;
  dvids_video_id: string | null;
  pdf_pairing: string | null;
  video_pairing: string | null;
  files: FileEntry[];
  text: { source: string; text: string } | null;
  metadata: FileMetadataView | null;
}

export interface FileEntry {
  id: number;
  kind: 'pdf' | 'image' | 'thumbnail' | 'video';
  source_system: 'war.gov' | 'dvids';
  source_url: string;
  resolved_url: string | null;
  local_path: string | null;
  size_bytes: number | null;
  sha256: string | null;
  pre_decrypt_sha256: string | null;
}

export interface FileMetadataView {
  pdf_pages: number | null;
  pdf_creator: string | null;
  pdf_producer: string | null;
  pdf_created_at: string | null;
  pdf_modified_at: string | null;
  pdf_encrypted: number | null;
  pdf_permissions: string | null;
  pdf_is_scan: number | null;
  width: number | null;
  height: number | null;
  exif_software: string | null;
  duration_seconds: number | null;
  video_codec: string | null;
  video_fps: number | null;
}
