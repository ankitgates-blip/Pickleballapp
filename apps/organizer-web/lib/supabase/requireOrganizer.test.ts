import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockRpc = vi.fn();

vi.mock('./server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

import { requireOrganizer, requireOwner } from './requireOrganizer';

beforeEach(() => {
  mockGetUser.mockReset();
  mockSingle.mockReset();
  mockFrom.mockReset();
  mockSelect.mockReset();
  mockEq.mockReset();
  mockRpc.mockReset();

  // Set up the chain of calls
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ single: mockSingle });
  mockRpc.mockResolvedValue({ error: null });
});

describe('requireOrganizer', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockSingle.mockReset();
  });

  it('returns the organizer and role for an owner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle.mockResolvedValue({
      data: { role: 'owner', organizers: { id: 'org-1', name: 'Ankit' } },
      error: null,
    });

    const result = await requireOrganizer();

    expect(result.organizer).toEqual({ id: 'org-1', name: 'Ankit' });
    expect(result.role).toBe('owner');

    // Assert the query was built with the correct arguments
    expect(mockFrom).toHaveBeenCalledWith('organizer_members');
    expect(mockSelect).toHaveBeenCalledWith('role, organizers(id, name)');
    expect(mockEq).toHaveBeenCalledWith('auth_user_id', 'user-1');
  });

  it('returns the organizer and role for a guest', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } } });
    mockSingle.mockResolvedValue({
      data: { role: 'guest', organizers: { id: 'org-1', name: 'Ankit' } },
      error: null,
    });

    const result = await requireOrganizer();

    expect(result.role).toBe('guest');
    expect(result.organizer).toEqual({ id: 'org-1', name: 'Ankit' });
  });

  it('handles the embedded organizers relation coming back as an array', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-3' } } });
    mockSingle.mockResolvedValue({
      data: { role: 'owner', organizers: [{ id: 'org-2', name: 'Other' }] },
      error: null,
    });

    const result = await requireOrganizer();

    expect(result.organizer).toEqual({ id: 'org-2', name: 'Other' });
  });

  it('falls back to claiming a pending guest invite when no membership is found, then retries once', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-4' } } });
    mockSingle
      .mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
      .mockResolvedValueOnce({
        data: { role: 'guest', organizers: { id: 'org-3', name: 'Reinvited' } },
        error: null,
      });

    const result = await requireOrganizer();

    expect(mockRpc).toHaveBeenCalledWith('claim_pending_guest_invite');
    expect(result.role).toBe('guest');
    expect(result.organizer).toEqual({ id: 'org-3', name: 'Reinvited' });
  });

  it('still redirects to /login when the retry finds no invite either', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-5' } } });
    mockSingle
      .mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'not found' } });

    await expect(requireOrganizer()).rejects.toThrow();

    expect(mockRpc).toHaveBeenCalledWith('claim_pending_guest_invite');
  });
});

describe('requireOwner', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockSingle.mockReset();
  });

  it('returns the result unchanged when the caller is the owner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle.mockResolvedValue({
      data: { role: 'owner', organizers: { id: 'org-1', name: 'Ankit' } },
      error: null,
    });

    const result = await requireOwner();

    expect(result.role).toBe('owner');
    expect(result.organizer).toEqual({ id: 'org-1', name: 'Ankit' });
  });

  it('throws a clear error when the caller is a guest', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } } });
    mockSingle.mockResolvedValue({
      data: { role: 'guest', organizers: { id: 'org-1', name: 'Ankit' } },
      error: null,
    });

    await expect(requireOwner()).rejects.toThrow('Only the workspace owner can do this.');
  });
});
