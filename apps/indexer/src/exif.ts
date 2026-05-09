// exiftool wrapper — gets us metadata across PDF, image, and video formats
// in one shot. Uses exiftool-vendored which bundles a portable binary so we
// don't require a system install.

import { exiftool, type Tags } from 'exiftool-vendored';

let started = false;
async function ensureStarted(): Promise<void> {
  if (started) return;
  started = true;
  // exiftool-vendored auto-spawns on first use; nothing to do here, but
  // keeping a no-op ready in case we later want to pre-warm.
}

export async function readExif(path: string): Promise<Tags | null> {
  await ensureStarted();
  try {
    return await exiftool.read(path);
  } catch (e) {
    return null;
  }
}

export async function shutdownExif(): Promise<void> {
  if (!started) return;
  await exiftool.end();
  started = false;
}

// Pull a few fields exiftool returns in slightly inconsistent shapes.
export interface SharedMetadata {
  width: number | null;
  height: number | null;
  exif_make: string | null;
  exif_model: string | null;
  exif_software: string | null;
  exif_taken_at: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  gps_altitude: number | null;
  duration_seconds: number | null;
  video_codec: string | null;
  video_bitrate: number | null;
  video_fps: number | null;
  video_frames: number | null;
  audio_codec: string | null;
  audio_channels: number | null;
}

export function pickSharedFields(tags: Tags): SharedMetadata {
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

  // exiftool-vendored returns objects for date/time fields; toISOString gets us a string.
  const isoDate = (v: unknown): string | null => {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof (v as { toISOString?: () => string }).toISOString === 'function') {
      try {
        return (v as { toISOString: () => string }).toISOString();
      } catch {
        return null;
      }
    }
    return String(v);
  };

  const t = tags as Record<string, unknown>;

  // Duration: exiftool gives ImageDataRate, Duration, MediaDuration depending on format.
  const dur =
    num(t['Duration']) ??
    num(t['MediaDuration']) ??
    num(t['TrackDuration']);

  return {
    width: num(t['ImageWidth']) ?? num(t['SourceImageWidth']),
    height: num(t['ImageHeight']) ?? num(t['SourceImageHeight']),
    exif_make: str(t['Make']),
    exif_model: str(t['Model']),
    exif_software: str(t['Software']) ?? str(t['CreatorTool']) ?? str(t['Encoder']),
    exif_taken_at:
      isoDate(t['DateTimeOriginal']) ??
      isoDate(t['CreateDate']) ??
      isoDate(t['MediaCreateDate']),
    gps_latitude: num(t['GPSLatitude']),
    gps_longitude: num(t['GPSLongitude']),
    gps_altitude: num(t['GPSAltitude']),
    duration_seconds: dur,
    video_codec: str(t['VideoCodec']) ?? str(t['CompressorID']) ?? str(t['CompressorName']),
    video_bitrate: num(t['VideoBitrate']) ?? num(t['AvgBitrate']),
    video_fps: num(t['VideoFrameRate']),
    video_frames: num(t['FrameCount']) ?? num(t['VideoFrameCount']),
    audio_codec: str(t['AudioFormat']) ?? str(t['AudioCodec']),
    audio_channels: num(t['AudioChannels']) ?? num(t['NumChannels']),
  };
}
