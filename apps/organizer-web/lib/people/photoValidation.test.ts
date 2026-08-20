import { describe, it, expect } from 'vitest';
import { validatePhotoFile, ALLOWED_PHOTO_MIME_TO_EXT, MAX_PHOTO_BYTES } from './photoValidation';

describe('validatePhotoFile', () => {
  it('accepts a valid JPEG under the size limit', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: 1024 })).toBeNull();
  });

  it('accepts a valid PNG under the size limit', () => {
    expect(validatePhotoFile({ type: 'image/png', size: 1024 })).toBeNull();
  });

  it('accepts a valid WebP under the size limit', () => {
    expect(validatePhotoFile({ type: 'image/webp', size: 1024 })).toBeNull();
  });

  it('accepts a file exactly at the size limit', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: MAX_PHOTO_BYTES })).toBeNull();
  });

  it('rejects an unsupported MIME type', () => {
    expect(validatePhotoFile({ type: 'image/gif', size: 1024 })).toBe(
      'Photo must be a JPEG, PNG, or WebP image'
    );
  });

  it('rejects a non-image MIME type', () => {
    expect(validatePhotoFile({ type: 'application/pdf', size: 1024 })).toBe(
      'Photo must be a JPEG, PNG, or WebP image'
    );
  });

  it('rejects a file over the size limit', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 })).toBe(
      'Photo must be 2MB or smaller'
    );
  });

  it('maps each allowed MIME type to its extension', () => {
    expect(ALLOWED_PHOTO_MIME_TO_EXT).toEqual({
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    });
  });
});
