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
      <header className="bg-teal-600 text-white shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/tournaments" className="flex items-center gap-2 font-extrabold text-lg tracking-tight">
            <span className="inline-block h-3 w-3 rounded-full bg-amber-400" />
            Pickle Turf Organizer
          </Link>
          {organizerName && (
            <form action={signOut} className="flex items-center gap-3">
              <span className="text-sm text-teal-50 hidden sm:inline">
                Hi, {organizerName}
              </span>
              <button
                type="submit"
                className="text-sm font-semibold bg-teal-700 hover:bg-teal-800 transition-colors px-3 py-1.5 rounded-full"
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
