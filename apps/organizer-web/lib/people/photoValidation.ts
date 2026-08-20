export const ALLOWED_PHOTO_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_PHOTO_MIME_TO_EXT[file.type]) {
    return 'Photo must be a JPEG, PNG, or WebP image';
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return 'Photo must be 2MB or smaller';
  }
  return null;
}
