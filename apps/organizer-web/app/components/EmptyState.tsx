// apps/organizer-web/app/components/EmptyState.tsx
// Shared "nothing here yet" treatment: a soft icon badge above the existing copy,
// instead of bare gray text. Reused across pages/sections that can be empty.
// `cta` is optional -- pass it only when there's an actual next step to take (e.g. a
// page-level "nothing here" state with a create action), not for secondary/nested
// empty states (like a single venue with no matches yet) that have no obvious action.
export default function EmptyState({
  icon,
  cta,
  children,
}: {
  icon: React.ReactNode;
  cta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-4">
      <div className="w-12 h-12 rounded-full bg-[#f4f1ea] text-navy-mid/50 flex items-center justify-center">
        {icon}
      </div>
      <p className="text-slate-500 text-sm max-w-xs">{children}</p>
      {cta}
    </div>
  );
}
