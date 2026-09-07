// apps/organizer-web/app/components/StandingsTable.tsx
//
// Shared standings table -- unifies what were 3 separate implementations
// (standings/page.tsx, bracket/page.tsx's league-standings table, and the public
// /t/[id] standings table). The common shape is rank (with medal on top 3), name, and
// W/L columns; each caller can add its own extra columns before or after W/L (e.g.
// standings/page.tsx's Ladder Pts and Point/Avg Diff columns, which only exist there --
// bracket and the public page show plain team W/L with no rank-movement or points data).
export type StandingsTableRow = {
  key: string;
  name: string;
  wins: number;
  losses: number;
  medal?: string;
  medalLabel?: string;
  nameClassName?: string;
};

export type StandingsTableColumn = {
  header: string;
  align?: 'left' | 'center';
  cells: React.ReactNode[];
};

export type StandingsTableProps = {
  nameColumnHeader: string;
  rows: StandingsTableRow[];
  columnsBeforeWL?: StandingsTableColumn[];
  columnsAfterWL?: StandingsTableColumn[];
  winLossStyle?: 'plain' | 'pill';
  highlightFirstRow?: boolean;
};

const WIN_PILL_CLASS =
  'stat-num inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-full bg-navy-tint text-navy-deep font-extrabold';
const LOSS_PILL_CLASS =
  'stat-num inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-full bg-slate-100 text-slate-500 font-extrabold';

export default function StandingsTable({
  nameColumnHeader,
  rows,
  columnsBeforeWL = [],
  columnsAfterWL = [],
  winLossStyle = 'plain',
  highlightFirstRow = false,
}: StandingsTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b border-slate-200">
          <th className="pb-2 font-semibold">{nameColumnHeader}</th>
          {columnsBeforeWL.map((col) => (
            <th
              key={col.header}
              className={`pb-2 font-semibold ${col.align === 'left' ? '' : 'text-center'}`}
            >
              {col.header}
            </th>
          ))}
          <th className="pb-2 font-semibold text-center">W</th>
          <th className="pb-2 font-semibold text-center">L</th>
          {columnsAfterWL.map((col) => (
            <th
              key={col.header}
              className={`pb-2 font-semibold ${col.align === 'left' ? '' : 'text-center'}`}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.key}
            className={
              highlightFirstRow && i === 0
                ? 'border-b border-slate-100 last:border-0 bg-gradient-to-r from-amber-50 via-amber-50/50 to-transparent'
                : 'border-b border-slate-100 last:border-0'
            }
          >
            <td className={`py-2 ${row.nameClassName ?? 'font-semibold text-slate-900'}`}>
              {row.medal && (
                <span className="mr-1.5" role="img" aria-label={row.medalLabel}>
                  {row.medal}
                </span>
              )}
              {row.name}
            </td>
            {columnsBeforeWL.map((col) => (
              <td key={col.header} className={`py-2 ${col.align === 'left' ? '' : 'text-center'}`}>
                {col.cells[i]}
              </td>
            ))}
            <td className="py-2 text-center">
              {winLossStyle === 'pill' ? (
                <span className={WIN_PILL_CLASS}>{row.wins}</span>
              ) : (
                <span className="stat-num text-navy-mid font-extrabold">{row.wins}</span>
              )}
            </td>
            <td className="py-2 text-center">
              {winLossStyle === 'pill' ? (
                <span className={LOSS_PILL_CLASS}>{row.losses}</span>
              ) : (
                <span className="stat-num text-muted font-semibold">{row.losses}</span>
              )}
            </td>
            {columnsAfterWL.map((col) => (
              <td key={col.header} className={`py-2 ${col.align === 'left' ? '' : 'text-center'}`}>
                {col.cells[i]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
