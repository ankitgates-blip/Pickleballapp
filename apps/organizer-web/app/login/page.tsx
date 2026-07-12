// apps/organizer-web/app/login/page.tsx
import Image from 'next/image';
import { cardClass } from '@/app/components/ui';
import GoogleSignInButton from './GoogleSignInButton';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="relative min-h-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-emerald-800 via-teal-600 to-cyan-600 px-4 py-12">
      <div
        aria-hidden
        className="ball-texture absolute -top-10 -right-10 h-64 w-64 rounded-full opacity-90 shadow-2xl"
        style={{ background: 'radial-gradient(circle at 35% 35%, #eaff00, #c9e800)' }}
      />
      <div
        aria-hidden
        className="ball-texture absolute -bottom-16 -left-16 h-72 w-72 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle at 35% 35%, #eaff00, #c9e800)' }}
      />
      <div className="relative w-full max-w-md space-y-6">
        <div className="text-center text-white">
          <Image src="/logo.png" alt="PicklerAlly DXB" width={64} height={64} className="mx-auto mb-3 rounded-full" />
          <h1 className="text-3xl font-extrabold tracking-tight">PICKLERALLY DXB</h1>
          <p className="text-teal-50 text-sm mt-1 font-medium">Run your tournaments, not a spreadsheet.</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <div className={cardClass}>
          <GoogleSignInButton />
        </div>
      </div>
    </main>
  );
}
