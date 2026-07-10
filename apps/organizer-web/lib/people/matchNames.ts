export function matchNamesToPeople(
  names: string[],
  existingPeople: Array<{ id: string; name: string }>
): { matched: Array<{ name: string; personId: string }>; newNames: string[] } {
  const byLowerName = new Map(
    existingPeople.map((p) => [p.name.trim().toLowerCase(), p.id])
  );

  const matched: Array<{ name: string; personId: string }> = [];
  const newNames: string[] = [];

  for (const name of names) {
    const personId = byLowerName.get(name.trim().toLowerCase());
    if (personId) {
      matched.push({ name, personId });
    } else {
      newNames.push(name);
    }
  }

  return { matched, newNames };
}
