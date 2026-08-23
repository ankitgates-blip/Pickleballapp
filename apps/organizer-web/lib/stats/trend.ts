export function renderTrend(
  trend: 'up' | 'down' | 'flat' | null,
  pointsChange: number | null
): string {
  if (trend === null || pointsChange === null) {
    return '';
  }
  if (trend === 'up') {
    return `▲ +${pointsChange}pp`;
  }
  if (trend === 'down') {
    return `▼ ${pointsChange}pp`;
  }
  return '— 0pp';
}

export function trendColorClass(trend: 'up' | 'down' | 'flat' | null): string {
  if (trend === 'up') {
    return 'text-emerald-600';
  }
  if (trend === 'down') {
    return 'text-red-500';
  }
  return 'text-slate-400';
}
