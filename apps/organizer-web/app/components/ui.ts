export const cardClass = 'bg-white rounded-2xl shadow-sm border border-[#eee7db] p-6';

// For cards whose entire purpose is a single action the organizer needs to take
// (generate/skip a round, add a match) — a warm gold-tinted card that stands apart
// from the plain white read-only cards (match lists, standings) around it.
export const actionCardClass =
  'bg-gradient-to-br from-[#fdf6e8] to-white rounded-2xl shadow-[0_4px_14px_rgba(168,135,79,0.18)] border-2 border-gold/50 p-6';

export const vibrantCardClass =
  'bg-white rounded-2xl p-4 border border-[#eee7db] shadow-[0_10px_25px_rgba(12,24,48,0.12)] relative overflow-hidden';

export const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-mid focus:border-navy-mid';

export const primaryButtonClass =
  'inline-flex items-center justify-center rounded-full bg-gradient-to-br from-brand-orange to-brand-orange-deep hover:from-[#e0752e] hover:to-[#c65530] text-white font-bold px-5 py-2.5 text-sm shadow-[0_6px_16px_rgba(210,98,28,0.4)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0';

export const accentButtonClass =
  'inline-flex items-center justify-center rounded-full bg-gradient-to-br from-[#c9a865] to-gold hover:from-[#d4b578] hover:to-[#b8965c] text-[#2a2110] font-extrabold px-5 py-2.5 text-sm shadow-[0_6px_16px_rgba(168,135,79,0.5)] transition-all hover:-translate-y-0.5';

export const outlineButtonClass =
  'inline-flex items-center justify-center rounded-full bg-white hover:bg-[#f4f1ea] text-navy-mid font-bold px-5 py-2.5 text-sm border-2 border-navy-mid transition-colors';

export const linkClass = 'text-navy-mid font-semibold hover:text-navy-deep hover:underline';

export const pillClass =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';

export const playerCardClass =
  'aspect-square bg-gradient-to-br from-sky-600 to-navy-deep rounded-2xl border border-gold/40 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(12,24,48,0.3)] hover:border-gold/70 flex flex-col items-center justify-center gap-2.5 p-4 text-center';

export const playerCardAvatarClass =
  'w-14 h-14 rounded-full bg-gradient-to-br from-[#fde68a] to-[#f59e0b] flex items-center justify-center text-xl font-black text-[#451a03]';

export const headingClass = 'font-heading font-bold text-navy-deep';

// A gold, tracked-caps section label with a small accent tick -- for a sub-section
// inside a page (e.g. "Player of the Month" / "Race to Player of the Month") that
// deserves more visual weight than a flat gray uppercase label, without competing
// with the page's own h1/h2 hierarchy.
export const sectionKickerClass =
  'inline-flex items-center gap-2 text-xs font-extrabold text-gold uppercase tracking-[0.2em] mb-3';
