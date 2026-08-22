import { describe, it, expect, vi, afterEach } from 'vitest';
import { shareOrDownloadPdf, shareOrDownloadFile, sanitizeFileNamePart } from './pdfShare';

const blob = new Blob(['test'], { type: 'application/pdf' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shareOrDownloadPdf', () => {
  it('shares the file via navigator.share when canShare returns true, and returns "shared"', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: shareMock,
    });

    const result = await shareOrDownloadPdf(blob, 'test.pdf', 'Test Title');

    expect(result).toBe('shared');
    expect(shareMock).toHaveBeenCalledTimes(1);
    const callArg = shareMock.mock.calls[0][0];
    expect(callArg.title).toBe('Test Title');
    expect(callArg.files).toHaveLength(1);
    expect(callArg.files[0].name).toBe('test.pdf');
  });

  it('returns "cancelled" when navigator.share rejects with an AbortError', async () => {
    const abortError = new Error('cancelled');
    abortError.name = 'AbortError';
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(abortError),
    });

    const result = await shareOrDownloadPdf(blob, 'test.pdf', 'Test Title');
    expect(result).toBe('cancelled');
  });

  it('re-throws non-AbortError errors from navigator.share', async () => {
    const realError = new Error('permission denied');
    realError.name = 'NotAllowedError';
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(realError),
    });

    await expect(shareOrDownloadPdf(blob, 'test.pdf', 'Test Title')).rejects.toThrow('permission denied');
  });

  it('falls back to a download when canShare is absent, and returns "downloaded"', async () => {
    vi.stubGlobal('navigator', {});
    const clickMock = vi.fn();
    const anchorStub = { href: '', download: '', click: clickMock };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchorStub),
    });
    const createObjectURLMock = vi.fn(() => 'blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });

    const result = await shareOrDownloadPdf(blob, 'test.pdf', 'Test Title');

    expect(result).toBe('downloaded');
    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(anchorStub.href).toBe('blob:mock-url');
    expect(anchorStub.download).toBe('test.pdf');
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });

  it('falls back to a download when canShare returns false', async () => {
    vi.stubGlobal('navigator', { canShare: () => false });
    const clickMock = vi.fn();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ href: '', download: '', click: clickMock })),
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    const result = await shareOrDownloadPdf(blob, 'test.pdf', 'Test Title');
    expect(result).toBe('downloaded');
    expect(clickMock).toHaveBeenCalledTimes(1);
  });
});

describe('shareOrDownloadFile', () => {
  it('shares the file via navigator.share with the given mime type, and returns "shared"', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: shareMock,
    });

    const result = await shareOrDownloadFile(blob, 'card.png', 'Test Title', 'image/png');

    expect(result).toBe('shared');
    expect(shareMock).toHaveBeenCalledTimes(1);
    const callArg = shareMock.mock.calls[0][0];
    expect(callArg.title).toBe('Test Title');
    expect(callArg.files).toHaveLength(1);
    expect(callArg.files[0].name).toBe('card.png');
    expect(callArg.files[0].type).toBe('image/png');
  });

  it('falls back to a download when canShare is absent, and returns "downloaded"', async () => {
    vi.stubGlobal('navigator', {});
    const clickMock = vi.fn();
    const anchorStub = { href: '', download: '', click: clickMock };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchorStub),
    });
    const createObjectURLMock = vi.fn(() => 'blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });

    const result = await shareOrDownloadFile(blob, 'card.png', 'Test Title', 'image/png');

    expect(result).toBe('downloaded');
    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(anchorStub.href).toBe('blob:mock-url');
    expect(anchorStub.download).toBe('card.png');
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('sanitizeFileNamePart', () => {
  it('replaces whitespace with hyphens and strips non-alphanumeric characters', () => {
    expect(sanitizeFileNamePart("Sunday Smash 8/16 (Pickle Turf)")).toBe('Sunday-Smash-816-Pickle-Turf');
  });

  it('falls back to "tournament" for an empty or all-punctuation input', () => {
    expect(sanitizeFileNamePart('   ')).toBe('tournament');
    expect(sanitizeFileNamePart('!!!')).toBe('tournament');
  });
});
