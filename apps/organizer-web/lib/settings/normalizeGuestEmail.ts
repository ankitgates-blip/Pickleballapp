export function normalizeGuestEmail(raw: string | null): string {
  const email = raw?.trim().toLowerCase() ?? '';

  if (!email || !email.includes('@')) {
    throw new Error('Enter a valid email address.');
  }

  return email;
}
