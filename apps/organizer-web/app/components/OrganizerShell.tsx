// apps/organizer-web/app/components/OrganizerShell.tsx
import Link from 'next/link';
import { signOut } from '@/app/login/actions';

export default function OrganizerShell({
  children,
  organizerName,
}: {
  children: React.ReactNode;
  organizerName?: string;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-800 via-teal-600 to-cyan-600 text-white shadow-lg">
        <div
          aria-hidden
          className="ball-texture absolute -top-6 -right-3 h-28 w-28 rounded-full opacity-90 shadow-lg"
          style={{ background: 'radial-gradient(circle at 35% 35%, #eaff00, #c9e800)' }}
        />
        <div className="relative max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/tournaments" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-300 text-lg shadow-md -rotate-6">
                🏓
              </span>
              <span className="font-heading font-extrabold text-lg tracking-tight leading-none">
                Pickle Turf Organizer
              </span>
            </Link>
            <Link href="/people" className="text-sm font-semibold text-teal-50 hover:text-white">
              Player Profile
            </Link>
            <Link href="/locations" className="text-sm font-semibold text-teal-50 hover:text-white">
              Locations
            </Link>
          </div>
          {organizerName && (
            <form action={signOut} className="flex items-center gap-3">
              <span className="text-sm text-teal-50 hidden sm:inline">
                Hi, {organizerName}
              </span>
              <button
                type="submit"
                className="text-sm font-semibold bg-teal-800/60 hover:bg-teal-800 transition-colors px-3 py-1.5 rounded-full backdrop-blur-sm"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
