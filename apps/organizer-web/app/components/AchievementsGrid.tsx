import type { Achievement, AchievementTierName } from '@/lib/stats/achievements';
import { groupAchievementsByCategory } from '@/lib/stats/achievements';

const CATEGORY_LABEL: Record<Achievement['category'], string> = {
  momentum: 'Momentum',
  'competitive-edge': 'Competitive Edge',
  durability: 'Durability',
  'location-loyalty': 'Location & Loyalty',
  'championship-legacy': 'Championship & Legacy',
  'format-mastery': 'Format Mastery',
  'identity-habits': 'Identity & Habits',
  'extremes-consistency': 'Extremes & Consistency',
  milestones: 'Milestones',
};

const TIER_STYLE: Record<AchievementTierName | 'special', { fill: string; ring: string; word: string; notches: number | 'inf' }> = {
  bronze: { fill: 'linear-gradient(135deg,#a77044,#c9906a,#a77044)', ring: '#824a02', word: 'BRONZE', notches: 1 },
  silver: { fill: 'linear-gradient(135deg,#a7a7ad,#d7d7d7,#a7a7ad)', ring: '#8a8a90', word: 'SILVER', notches: 2 },
  gold: { fill: 'linear-gradient(135deg,#d6af36,#fde68a,#d6af36)', ring: '#a8874f', word: 'GOLD', notches: 3 },
  platinum: { fill: 'linear-gradient(135deg,#b8d4e8,#ffffff,#e8f1fa)', ring: '#8fb3cc', word: 'PLATINUM', notches: 'inf' },
  special: { fill: 'linear-gradient(135deg,#d6af36,#fde68a,#d6af36)', ring: '#a8874f', word: 'EARNED', notches: 0 },
};

function Notches({ tier }: { tier: AchievementTierName | 'special' }) {
  const { notches } = TIER_STYLE[tier];
  if (notches === 0) return null;
  if (notches === 'inf') {
    return <div className="w-8 h-[2px] mx-auto mt-1" style={{ background: TIER_STYLE[tier].ring }} />;
  }
  return (
    <div className="flex items-center justify-center gap-0.5 mt-1">
      {Array.from({ length: notches }).map((_, i) => (
        <span key={i} className="w-1 h-1 rounded-full" style={{ background: TIER_STYLE[tier].ring }} />
      ))}
    </div>
  );
}

function BadgeMedallion({ achievement }: { achievement: Achievement }) {
  const { emoji, label, tier, description, earned } = achievement;
  const style = earned && tier ? TIER_STYLE[tier] : null;
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-xl"
        style={
          style
            ? { background: style.fill, border: `2px solid ${style.ring}`, boxShadow: `0 0 10px ${style.ring}55` }
            : { background: '#f1f5f9', border: '2px dashed #cbd5e1' }
        }
      >
        <span style={{ opacity: earned ? 1 : 0.35, filter: earned ? 'none' : 'grayscale(1)' }}>{emoji}</span>
      </div>
      <span className={`text-[10.5px] font-bold mt-1 leading-tight ${earned ? 'text-navy-deep' : 'text-slate-400'}`}>
        {label}
      </span>
      {earned && style && tier !== 'special' && (
        <span className="text-[8.5px] font-extrabold tracking-wider mt-0.5" style={{ color: style.ring }}>
          {style.word}
        </span>
      )}
      {earned && tier && tier !== 'special' && <Notches tier={tier} />}
      <span className={`text-[8.5px] mt-0.5 leading-tight ${earned ? 'text-muted' : 'text-slate-400'}`}>
        {description}
      </span>
    </div>
  );
}

/**
 * Shared achievements shelf renderer -- the one place both app/p/[id]/page.tsx and
 * app/people/[id]/page.tsx render the badge grid, so a future visual change (or a
 * stale tier palette) can't happen on one page without the other. Grouped into
 * category shelves rather than one flat grid: at 50 badges a single grid reads as an
 * undifferentiated wall, and research on comparable apps (Strava's Trophy Case,
 * Peloton's per-discipline milestone shelves) groups by theme instead.
 */
export default function AchievementsGrid({ achievements }: { achievements: Achievement[] }) {
  const groups = groupAchievementsByCategory(achievements);
  return (
    <div>
      {groups.map((g) => (
        <div key={g.category} className="mb-5 last:mb-0">
          <h3 className="text-xs font-extrabold text-gold uppercase tracking-[0.15em] mb-3">
            {CATEGORY_LABEL[g.category]}
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {g.achievements.map((a) => (
              <BadgeMedallion key={a.key} achievement={a} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
