/** Hands the finished PDF to the browser as a download. Nothing leaves the computer. */
export function saveFile(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing the memory.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
