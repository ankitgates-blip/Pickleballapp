// apps/organizer-web/app/components/OrganizerShell.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/login/actions';
import SaveButton from './SaveButton';

function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" strokeWidth={2} />
      <circle cx="12" cy="10.25" r="2.75" fill="currentColor" />
      <path d="M6.75 17c0-2.21 2.35-3.5 5.25-3.5s5.25 1.29 5.25 3.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function LeaderboardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M8 3h8v5.25a4 4 0 0 1-8 0V3z" fill="currentColor" />
      <path d="M8 4.25H5.25a2.75 2.75 0 0 0 2.75 4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M16 4.25h2.75a2.75 2.75 0 0 1-2.75 4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M12 12.25v2.75" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M8.25 20h7.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M9.25 20v-2.25a2.75 2.75 0 0 1 5.5 0V20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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
  const isPlayerProfileActive = pathname.startsWith('/people');
  const isLocationsActive = pathname.startsWith('/locations');

  return (
    <div className="min-h-screen flex flex-col">
      <div className="relative">
        <header
          className="relative overflow-hidden text-white shadow-lg"
          style={{
            backgroundImage:
              "linear-gradient(120deg, rgba(12,24,48,0.92), rgba(22,41,78,0.82) 55%, rgba(12,24,48,0.78)), url('/header-bg.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div
            aria-hidden
            className="ball-texture absolute -top-6 -right-3 h-28 w-28 rounded-full opacity-90 shadow-lg"
            style={{ background: 'radial-gradient(circle at 35% 35%, #f2942e, #d2621c)' }}
          />
          <div aria-hidden className="header-dots absolute inset-0" />
          {/* pl-[170px] clears the overlapping logo: left-[30px] + 140px width below */}
          <div className="relative max-w-3xl mx-auto px-4 pt-4 pb-2 pl-[170px] min-h-[150px] flex flex-col justify-center">
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
              <span className="font-brand text-2xl sm:text-4xl tracking-wide leading-tight">
                PICKLERALLY DXB
              </span>
              <div className="w-12 h-[3px] bg-gold rounded-full mt-2 mb-2" />
              <span className="font-script italic text-lg text-[#c9a865]">
                Premier Dubai Pickleball League App
              </span>
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
        <Link href="/tournaments" className="absolute z-10 left-[30px] top-[150px] -translate-y-1/2">
          <Image
            src="/logo.png"
            alt="PicklerAlly DXB"
            width={140}
            height={140}
            className="rounded-full border-[5px] border-white shadow-xl"
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
          href="/people"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold ${
            isPlayerProfileActive ? 'text-[#b69a6b]' : 'text-[#b9c4dd]'
          }`}
        >
          <PersonIcon />
          Player Profile
        </Link>
        <Link href="/tournaments/new" className="relative flex-1 flex flex-col items-center">
          <span className="absolute -top-[18px] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-brand-orange border-[3px] border-white shadow-lg">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0c1830" strokeWidth={3} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="mt-9 text-[10px] font-extrabold text-white">Create League</span>
        </Link>
        <Link
          href="/locations"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold ${
            isLocationsActive ? 'text-[#b69a6b]' : 'text-[#b9c4dd]'
          }`}
        >
          <LeaderboardIcon />
          Leaderboard
        </Link>
      </nav>
    </div>
  );
}
