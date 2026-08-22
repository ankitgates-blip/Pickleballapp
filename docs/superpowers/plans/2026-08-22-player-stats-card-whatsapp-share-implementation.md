# Player Stats Card WhatsApp Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking the Player Stats Card opens the native share sheet
(WhatsApp, Messages, etc.) with the PNG image, falling back to a plain
download where file sharing isn't supported — reusing this app's
existing proven share-or-download pattern.

**Architecture:** `lib/pdf/pdfShare.ts`'s `shareOrDownloadPdf` is
generalized into `shareOrDownloadFile` (takes a MIME type parameter);
`shareOrDownloadPdf` becomes a thin wrapper around it, so none of the 4
existing PDF Share buttons change behavior. `PlayerStatsCard.tsx`'s
`handleDownload` calls the new generic function with `'image/png'`
instead of building its own anchor-click download.

**Tech Stack:** `navigator.share`/`navigator.canShare` (standard Web
APIs, already used elsewhere in this codebase), Vitest.

## Global Constraints

- The shared/downloaded file stays a PNG image — this does not turn the
  card into a PDF or change what it looks like.
- None of the 4 existing PDF Share buttons (Roster, Results, Schedule,
  Player Stats PDF) change behavior — `shareOrDownloadPdf`'s exported
  signature and behavior stay identical to callers.
- No new npm dependency.

---

### Task 1: Generalize `shareOrDownloadPdf` into `shareOrDownloadFile`

**Files:**
- Modify: `apps/organizer-web/lib/pdf/pdfShare.ts`
- Test: `apps/organizer-web/lib/pdf/pdfShare.test.ts`

**Interfaces:**
- Produces: `shareOrDownloadFile(blob: Blob, fileName: string, title:
  string, mimeType: string): Promise<'shared' | 'downloaded' |
  'cancelled'>`, exported from `apps/organizer-web/lib/pdf/pdfShare.ts`.
  Task 2 imports and calls this with `'image/png'`.
- `shareOrDownloadPdf(blob, fileName, title)` keeps its existing
  signature and behavior unchanged for its 4 existing callers — it
  becomes a thin wrapper: `shareOrDownloadFile(blob, fileName, title,
  'application/pdf')`.

- [ ] **Step 1: Write the failing tests**

In `apps/organizer-web/lib/pdf/pdfShare.test.ts`, find:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { shareOrDownloadPdf, sanitizeFileNamePart } from './pdfShare';
```

Replace with:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { shareOrDownloadPdf, shareOrDownloadFile, sanitizeFileNamePart } from './pdfShare';
```

Then find:

```typescript
describe('sanitizeFileNamePart', () => {
```

Replace with:

```typescript
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
```

(The existing `shareOrDownloadPdf` tests above this point are
untouched — they continue to exercise the AbortError/re-throw/
canShare-false paths through the now-thin `shareOrDownloadPdf` wrapper,
which delegates to the same underlying logic these 2 new tests cover
directly for the generic function, so there's no need to duplicate
every case twice.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/pdf/pdfShare.test.ts`
Expected: FAIL — `shareOrDownloadFile` is not exported from `./pdfShare`.

- [ ] **Step 3: Implement `shareOrDownloadFile`**

Replace the entire contents of `apps/organizer-web/lib/pdf/pdfShare.ts`
with:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/pdf/pdfShare.test.ts`
Expected: PASS — all tests in the file green, including the existing 7
`shareOrDownloadPdf`/`sanitizeFileNamePart` tests (now passing through
the thin wrapper) and the 2 new `shareOrDownloadFile` tests.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/pdf/pdfShare.ts apps/organizer-web/lib/pdf/pdfShare.test.ts
git commit -m "feat: generalize shareOrDownloadPdf into shareOrDownloadFile"
```

---

### Task 2: Wire the Player Stats Card to share instead of just download

**Files:**
- Modify: `apps/organizer-web/app/components/PlayerStatsCard.tsx`

**Interfaces:**
- Consumes: `shareOrDownloadFile` from `@/lib/pdf/pdfShare` (Task 1).

This is a presentational/behavioral change with no dedicated test file,
per this project's established convention for this component (it has
none already). Correctness is verified by the build passing and by
manual regression in Task 3.

- [ ] **Step 1: Add the import**

Find:

```tsx
import { sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
```

Replace with:

```tsx
import { shareOrDownloadFile, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
```

- [ ] **Step 2: Replace the forced-download ending with share-or-download**

Find:

```tsx
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('Failed to generate image');

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${sanitizeFileNamePart(name)}-stats-card.png`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      setStatus('idle');
```

Replace with:

```tsx
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('Failed to generate image');

      const fileName = `${sanitizeFileNamePart(name)}-stats-card.png`;
      await shareOrDownloadFile(blob, fileName, name, 'image/png');
      setStatus('idle');
```

- [ ] **Step 3: Update the caption text**

Find:

```tsx
      <p className="text-xs text-slate-400 mt-1.5">Click the card to download it as an image.</p>
```

Replace with:

```tsx
      <p className="text-xs text-slate-400 mt-1.5">Click the card to share or download it as an image.</p>
```

- [ ] **Step 4: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 205 tests pass
(203 existing + 2 new `shareOrDownloadFile` tests from Task 1).

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/app/components/PlayerStatsCard.tsx
git commit -m "feat: share Player Stats Card via native share sheet instead of forcing a download"
```

---

### Task 3: Push, verify CI, manual regression

**Files:** none (verification-only task). No database migration is
needed — this task touches no schema.

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

- On a phone (where the Web Share API for files is actually supported —
  desktop Chrome/Firefox generally is not), open a player's Player
  Stats Card and click it. Confirm the native share sheet opens with
  WhatsApp as one of the options, and that sharing to WhatsApp (or
  saving/sending to yourself) produces a real PNG image, not a PDF or a
  broken file.
- On desktop, click the card and confirm it still falls back to a
  plain download (since desktop browsers typically don't support
  `navigator.canShare` with files) — the file should download exactly
  as it did before this change.
- Confirm the caption text below the card now reads "Click the card to
  share or download it as an image."
- Confirm all 4 existing PDF Share buttons (Roster, Results, Schedule,
  Player Stats PDF export) still work exactly as before — this is a
  regression check on the generalized helper they all still depend on.

Clean up any disposable test data used for this check afterward.
