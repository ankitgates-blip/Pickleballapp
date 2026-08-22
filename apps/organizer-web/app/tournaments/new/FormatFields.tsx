'use client';

import { useState } from 'react';
import { inputClass } from '@/app/components/ui';
import { TOURNAMENT_FORMATS } from '@/lib/tournament/formats';

export default function FormatFields() {
  const [format, setFormat] = useState('round_robin');

  return (
    <>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Format</label>
        <select
          name="format"
          required
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className={inputClass}
        >
          {TOURNAMENT_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {format === 'popcorn' && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Number of rounds (Popcorn only)
          </label>
          <input name="popcornRounds" type="number" defaultValue={5} min={1} className={inputClass} />
        </div>
      )}
      {format === 'gauntlet' && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Number of rounds (Gauntlet only)
          </label>
          <input name="gauntletRounds" type="number" defaultValue={5} min={1} className={inputClass} />
        </div>
      )}
      {format === 'claim_the_throne' && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Number of rounds (Claim the Throne only)
          </label>
          <input name="claimTheThroneRounds" type="number" defaultValue={5} min={1} className={inputClass} />
        </div>
      )}
      {format === 'up_and_down_the_river' && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Number of rounds (Up and Down the River only)
          </label>
          <input name="upAndDownRiverRounds" type="number" defaultValue={5} min={1} className={inputClass} />
        </div>
      )}
      {format === 'custom' && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Number of rounds (Custom Tournament only)
          </label>
          <input name="customRounds" type="number" defaultValue={5} min={1} className={inputClass} />
        </div>
      )}
    </>
  );
}
