import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();

vi.mock('./server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import { requireOrganizer, requireOwner } from './requireOrganizer';

beforeEach(() => {
  mockGetUser.mockReset();
  mockSingle.mockReset();
  mockFrom.mockReset();
  mockSelect.mockReset();
  mockEq.mockReset();

  // Set up the chain of calls
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ single: mockSingle });
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
