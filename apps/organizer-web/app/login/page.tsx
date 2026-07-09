import { signIn, signUp } from './actions';
import { cardClass, inputClass, primaryButtonClass, accentButtonClass } from '@/app/components/ui';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-600 to-teal-800 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center text-white">
          <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-amber-400 flex items-center justify-center text-2xl font-black text-teal-900 shadow-lg">
            PT
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Pickle Turf Organizer</h1>
          <p className="text-teal-100 text-sm mt-1">Run your tournaments, not a spreadsheet.</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Sign in</h2>
          <form action={signIn} className="space-y-3">
            <input name="email" type="email" placeholder="Email" required className={inputClass} />
            <input
              name="password"
              type="password"
              placeholder="Password"
              required
              className={inputClass}
            />
            <button type="submit" className={`${primaryButtonClass} w-full`}>
              Sign in
            </button>
          </form>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-1">First time here?</h2>
          <p className="text-sm text-slate-500 mb-3">Create an organizer account.</p>
          <form action={signUp} className="space-y-3">
            <input name="name" type="text" placeholder="Your name" required className={inputClass} />
            <input name="email" type="email" placeholder="Email" required className={inputClass} />
            <input
              name="password"
              type="password"
              placeholder="Password"
              required
              className={inputClass}
            />
            <button type="submit" className={`${accentButtonClass} w-full`}>
              Sign up
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
