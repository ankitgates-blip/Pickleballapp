export type ShareTextResult = 'shared' | 'copied' | 'cancelled';

// Plain-text sibling of lib/pdf/pdfShare.ts's shareOrDownloadFile -- for share buttons
// that just need to hand off a message (no file attachment). Tries the native share
// sheet first, falls back to clipboard-copy where navigator.share isn't available
// (e.g. desktop browsers).
export async function shareOrCopyText(text: string, title: string): Promise<ShareTextResult> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled';
      }
      throw err;
    }
  }

  await navigator.clipboard.writeText(text);
  return 'copied';
}
