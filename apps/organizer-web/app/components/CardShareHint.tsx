// The identical helper line under every share-a-rendered-card button (PlayerStatsCard,
// bracket's ScheduleCard, results' ChampionCard) -- previously copy-pasted 3 times.
// Distinct from ShareHint.tsx: that one describes a dedicated "Share" button's
// mobile-vs-desktop behavior; this one describes clicking the card image itself.
export default function CardShareHint() {
  return <p className="text-xs text-muted mt-1.5">Click the card to share or download it as an image.</p>;
}
