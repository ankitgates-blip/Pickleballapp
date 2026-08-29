// apps/organizer-web/app/components/OrganizerShell.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/login/actions';
import SaveButton from './SaveButton';

function PersonIcon({ active }: { active?: boolean }) {
  if (active) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="4" fill="currentColor" />
        <circle cx="12" cy="10.25" r="2.75" fill="#0c1830" />
        <path d="M6.75 17c0-2.21 2.35-3.5 5.25-3.5s5.25 1.29 5.25 3.5" stroke="#0c1830" strokeWidth={2} strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" strokeWidth={2} />
      <circle cx="12" cy="10.25" r="2.75" fill="currentColor" />
      <path d="M6.75 17c0-2.21 2.35-3.5 5.25-3.5s5.25 1.29 5.25 3.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/** Distinct ranked-bars glyph — deliberately not trophy-shaped, unlike TrophyIcon. */
function LeaderboardIcon({ active }: { active?: boolean }) {
  if (active) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="13" width="4" height="7" rx="1" fill="currentColor" />
        <rect x="10" y="9" width="4" height="11" rx="1" fill="currentColor" />
        <rect x="16" y="5" width="4" height="15" rx="1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="13" width="4" height="7" rx="1" stroke="currentColor" strokeWidth={2} />
      <rect x="10" y="9" width="4" height="11" rx="1" stroke="currentColor" strokeWidth={2} />
      <rect x="16" y="5" width="4" height="15" rx="1" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

function TrophyIcon({ active }: { active?: boolean }) {
  if (active) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" fill="currentColor" />
        <path d="M7 5.25H4.25a2.75 2.75 0 0 0 2.75 4.5" fill="currentColor" />
        <path d="M17 5.25h2.75a2.75 2.75 0 0 1-2.75 4.5" fill="currentColor" />
        <path d="M12 13.25v3" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <path d="M8.5 20h7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <path d="M9.5 20v-1.5a2.5 2.5 0 0 1 5 0V20" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" fill="currentColor" />
      <path d="M7 5.25H4.25a2.75 2.75 0 0 0 2.75 4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M17 5.25h2.75a2.75 2.75 0 0 1-2.75 4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M12 13.25v3" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M8.5 20h7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M9.5 20v-1.5a2.5 2.5 0 0 1 5 0V20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LeaguesIcon({ active }: { active?: boolean }) {
  if (active) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="currentColor" />
        <path d="M3.5 9.5h17" stroke="#0c1830" strokeWidth={2} />
        <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth={2} />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth={2} />
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export default function OrganizerShell({
  children,
  organizerName,
}: {
  children: React.ReactNode;
  organizerName?: string;
}) {
  const pathname = usePathname();
  const isLeaguesActive = pathname.startsWith('/tournaments');
  const isPlayerProfileActive = pathname.startsWith('/people');
  const isLocationsActive = pathname.startsWith('/locations');
  const isPlayerOfTheMonthActive = pathname.startsWith('/player-of-the-month');

  return (
    <div className="min-h-screen flex flex-col">
      <div className="relative">
        <header
          className="relative overflow-hidden text-white shadow-lg"
          style={{
            // Near-vertical wash (was a 120deg diagonal) -- the real skyline photo below
            // sits at the bottom of the frame, so a diagonal gradient would darken one
            // side of it unevenly. Darkest at the bottom (where the header meets the
            // page and the skyline's busiest silhouette detail is), lightest at the top
            // "sky" strip so a hint of the photo's own dusk color shows through behind
            // the wordmark.
            backgroundImage:
              "linear-gradient(105deg, rgba(28,53,96,0.4), rgba(22,41,78,0.62) 55%, rgba(12,24,48,0.9)), url('/header-dxb-skyline.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center bottom',
          }}
        >
          <div aria-hidden className="header-dots absolute inset-0" />
          {/* pl-[170px] clears the overlapping logo: left-[30px] + 140px width below */}
          <div className="relative max-w-3xl mx-auto px-4 pt-4 pb-2 pl-[170px] min-h-[196px] flex flex-col justify-center">
            <div
              className="rounded-2xl px-4 py-3 -mx-4 inline-block"
              style={{
                background: 'rgba(255,255,255,0.10)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                border: '1px solid rgba(255,255,255,0.20)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              }}
            >
              <span className="font-heading italic text-2xl sm:text-4xl tracking-wide leading-tight">
                PICKLERALLY DXB
              </span>
              <div className="w-12 h-[3px] bg-gold rounded-full mt-2" />
            </div>
          </div>
          {organizerName && (
            <form action={signOut} className="absolute top-3 right-4 flex items-center gap-3">
              <span className="text-sm text-[#dbe4f5] hidden sm:inline">
                Hi, {organizerName}
              </span>
              <SaveButton
                className="text-sm font-semibold bg-navy-mid/60 hover:bg-navy-mid transition-colors px-3 py-1.5 rounded-full backdrop-blur-sm disabled:opacity-50"
                pendingLabel="Signing out…"
              >
                Sign out
              </SaveButton>
            </form>
          )}
        </header>
        <Link href="/tournaments" className="absolute z-10 left-[30px] top-[196px] -translate-y-1/2">
          <Image
            src="/logo.png"
            alt="PicklerAlly DXB"
            width={140}
            height={140}
            className="rounded-full border-[5px] border-white shadow-xl object-cover"
          />
        </Link>
      </div>
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-20 pb-24">{children}</main>
      <nav
        className="fixed bottom-0 left-0 right-0 flex text-white shadow-[0_-4px_12px_rgba(0,0,0,0.15)] z-20"
        style={{
          backgroundImage: 'linear-gradient(120deg, #0c1830, #16294e 55%, #1c3560)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <Link
          href="/tournaments"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold border-t-[3px] transition-colors ${
            isLeaguesActive ? 'border-t-gold-highlight text-gold-highlight' : 'border-t-transparent text-[#b9c4dd]'
          }`}
        >
          <LeaguesIcon active={isLeaguesActive} />
          Leagues
        </Link>
        <Link
          href="/people"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold border-t-[3px] transition-colors ${
            isPlayerProfileActive ? 'border-t-gold-highlight text-gold-highlight' : 'border-t-transparent text-[#b9c4dd]'
          }`}
        >
          <PersonIcon active={isPlayerProfileActive} />
          Players
        </Link>
        <Link href="/tournaments/new" className="relative flex-1 flex flex-col items-center">
          <span className="absolute -top-[18px] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-brand-orange border-[3px] border-white shadow-lg">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0c1830" strokeWidth={3} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="mt-9 text-[10px] font-extrabold text-white">New</span>
        </Link>
        <Link
          href="/player-of-the-month"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold border-t-[3px] transition-colors ${
            isPlayerOfTheMonthActive ? 'border-t-gold-highlight text-gold-highlight' : 'border-t-transparent text-[#b9c4dd]'
          }`}
        >
          <TrophyIcon active={isPlayerOfTheMonthActive} />
          Awards
        </Link>
        <Link
          href="/locations"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold border-t-[3px] transition-colors ${
            isLocationsActive ? 'border-t-gold-highlight text-gold-highlight' : 'border-t-transparent text-[#b9c4dd]'
          }`}
        >
          <LeaderboardIcon active={isLocationsActive} />
          Leaderboard
        </Link>
      </nav>
    </div>
  );
}
