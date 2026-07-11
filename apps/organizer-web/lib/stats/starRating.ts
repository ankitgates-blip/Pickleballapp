export function starRating(winPercentage: number): 1 | 2 | 3 | 4 | 5 {
  if (winPercentage >= 75) return 5;
  if (winPercentage >= 60) return 4;
  if (winPercentage >= 50) return 3;
  if (winPercentage >= 25) return 2;
  return 1;
}

export function renderStars(rating: number): string {
  const filled = '★'.repeat(rating);
  const empty = '☆'.repeat(5 - rating);
  return filled + empty;
}
