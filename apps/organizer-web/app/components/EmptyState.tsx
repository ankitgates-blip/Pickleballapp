// apps/organizer-web/app/components/EmptyState.tsx
// Shared "nothing here yet" treatment: a soft icon badge above the existing copy,
// instead of bare gray text. Reused across pages/sections that can be empty.
export default function EmptyState({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-4">
      <div className="w-12 h-12 rounded-full bg-[#f4f1ea] text-navy-mid/50 flex items-center justify-center">
        {icon}
      </div>
      <p className="text-slate-500 text-sm max-w-xs">{children}</p>
    </div>
  );
}
