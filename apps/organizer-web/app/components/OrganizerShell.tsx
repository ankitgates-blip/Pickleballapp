// apps/organizer-web/app/components/OrganizerShell.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/login/actions';

function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" fill="currentColor" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function LeaderboardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M6 20V13M12 20V7M18 20V10" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M12 1.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="currentColor" />
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
          {/* pl-[170px] clears the overlapping logo: left-[30px] + 140px width below */}
          <div className="relative max-w-3xl mx-auto px-4 pt-4 pb-2 pl-[170px] min-h-[150px] flex flex-col justify-center">
            <span
              className="font-brand text-lg tracking-wide leading-none"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.4)' }}
            >
              PICKLERALLY DXB
            </span>
            <span
              className="font-script italic text-lg text-[#c9a865] mt-1"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
            >
              Premier Dubai Pickle League App
            </span>
          </div>
          {organizerName && (
            <form action={signOut} className="absolute top-3 right-4 flex items-center gap-3">
              <span className="text-sm text-[#dbe4f5] hidden sm:inline">
                Hi, {organizerName}
              </span>
              <button
                type="submit"
                className="text-sm font-semibold bg-navy-mid/60 hover:bg-navy-mid transition-colors px-3 py-1.5 rounded-full backdrop-blur-sm"
              >
                Sign out
              </button>
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
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-14 pb-24">{children}</main>
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
            isPlayerProfileActive ? 'text-gold' : 'text-[#b9c4dd]'
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
          <span className="mt-9 text-[10px] font-extrabold text-white">Create Tournament</span>
        </Link>
        <Link
          href="/locations"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold ${
            isLocationsActive ? 'text-gold' : 'text-[#b9c4dd]'
          }`}
        >
          <LeaderboardIcon />
          Leaderboard
        </Link>
      </nav>
    </div>
  );
}
