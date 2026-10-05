const KB = 1000;
const MB = 1000 * 1000;

/**
 * A file size the way the Mac's Finder shows it, in decimal units
 * (1 MB = 1,000,000 bytes), so the number matches what people see there.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / KB))} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}
