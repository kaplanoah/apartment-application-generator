/**
 * Output size choices. Only photos and scanned images are resized (including
 * those inside PDFs); text is never touched, so it stays sharp. Limits are set
 * by how large an image prints on a letter page (about 10.5" on the long
 * side), which keeps ID cards readable.
 */
export type SizePresetId = 'smaller' | 'balanced' | 'full';

export interface SizePreset {
  readonly id: SizePresetId;
  readonly label: string;
  readonly description: string;
  /** Longest image edge in pixels, or null to keep the original resolution. */
  readonly maxImageEdge: number | null;
  /** JPEG quality, 0–1, used whenever an image has to be re-encoded. */
  readonly jpegQuality: number;
}

export const SIZE_PRESETS: readonly SizePreset[] = [
  {
    id: 'smaller',
    label: 'Smaller',
    description: 'For email and upload limits. Photos and scans at about 110 dpi; IDs stay readable.',
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
    id: 'full',
    label: 'Full quality',
    description: 'Everything keeps its original resolution. Largest file.',
    maxImageEdge: null,
    jpegQuality: 0.92,
  },
];

export const DEFAULT_SIZE_PRESET: SizePresetId = 'balanced';

export function getSizePreset(id: SizePresetId): SizePreset {
  const preset = SIZE_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown size preset: ${id}`);
  return preset;
}
