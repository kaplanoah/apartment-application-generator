/**
 * Output size choices. Only photos and scanned images are resized (including
 * those inside PDFs); text is never touched, so it stays sharp. Limits are set
 * by how large an image prints on a letter page (about 10.5" on the long
 * side), which keeps ID cards readable.
 */
export type SizePresetId = 'smaller' | 'balanced' | 'high';

export interface SizePreset {
  readonly id: SizePresetId;
  readonly label: string;
  readonly description: string;
  /** Longest image edge in pixels; larger photos and scans are scaled down to it. */
  readonly maxImageEdge: number;
  /** JPEG quality, 0–1, used whenever an image has to be re-encoded. */
  readonly jpegQuality: number;
}

export const SIZE_PRESETS: readonly SizePreset[] = [
  {
    id: 'smaller',
    label: 'Smaller',
    description: 'For email and upload limits. Photos and scans at about 110 dpi. IDs stay readable.',
    maxImageEdge: 1150,
    jpegQuality: 0.72,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Recommended. Photos and scans at about 150 dpi, sharp on screen and in print.',
    maxImageEdge: 1600,
    jpegQuality: 0.82,
  },
  {
    id: 'high',
    label: 'High',
    description: 'For printing. Photos and scans at about 300 dpi: looks the same as the originals.',
    maxImageEdge: 3200,
    jpegQuality: 0.9,
  },
];

export const DEFAULT_SIZE_PRESET: SizePresetId = 'balanced';

export function getSizePreset(id: SizePresetId): SizePreset {
  const preset = SIZE_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown size preset: ${id}`);
  return preset;
}
