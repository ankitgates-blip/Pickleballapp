export type ShareOrDownloadResult = 'shared' | 'downloaded' | 'cancelled';

export async function shareOrDownloadFile(
  blob: Blob,
  fileName: string,
  title: string,
  mimeType: string
): Promise<ShareOrDownloadResult> {
  const file = new File([blob], fileName, { type: mimeType });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled';
      }
      throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

export async function shareOrDownloadPdf(
  blob: Blob,
  fileName: string,
  title: string
): Promise<ShareOrDownloadResult> {
  return shareOrDownloadFile(blob, fileName, title, 'application/pdf');
}

export function sanitizeFileNamePart(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  return cleaned || 'tournament';
}
