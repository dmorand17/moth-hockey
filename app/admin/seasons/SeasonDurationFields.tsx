"use client";

import { useState } from "react";

const inputCls =
  "bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice w-full";

// end = start + weeks×7 days, computed in local time from a YYYY-MM-DD start.
function computeEnd(startDate: string, weeksRaw: string): string {
  const weeks = parseInt(weeksRaw, 10);
  if (!startDate || isNaN(weeks) || weeks <= 0) return "";
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  const end = new Date(y, m - 1, d);
  end.setDate(end.getDate() + weeks * 7);
  const mm = String(end.getMonth() + 1).padStart(2, "0");
  const dd = String(end.getDate()).padStart(2, "0");
  return `${end.getFullYear()}-${mm}-${dd}`;
}

// Start date + regular-season weeks. End date is derived from those two and
// shown read-only — weeks is the single source of truth for the season's span.
// Field names (`start_date`, `weeks`) match the server actions.
export function SeasonDurationFields({
  defaultStartDate = "",
  defaultWeeks = "",
}: {
  defaultStartDate?: string;
  defaultWeeks?: string;
}) {
  const [start, setStart] = useState(defaultStartDate);
  const [weeks, setWeeks] = useState(defaultWeeks);
  const end = computeEnd(start, weeks);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block w-full sm:w-auto sm:flex-1 sm:min-w-[150px]">
        <span className="eyebrow">Start date</span>
        <input
          type="date"
          name="start_date"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className={`mt-1 ${inputCls}`}
        />
      </label>
      <label className="block w-full sm:w-auto sm:min-w-[150px]">
        <span className="eyebrow">Regular season weeks</span>
        <input
          type="number"
          name="weeks"
          required
          min={1}
          max={52}
          placeholder="10"
          value={weeks}
          onChange={(e) => setWeeks(e.target.value)}
          className={`mt-1 ${inputCls}`}
        />
      </label>
      <label className="block w-full sm:w-auto sm:flex-1 sm:min-w-[150px]">
        <span className="eyebrow">End date (calculated)</span>
        <input
          type="text"
          readOnly
          tabIndex={-1}
          value={end || "—"}
          aria-label="End date, calculated from weeks"
          className={`mt-1 ${inputCls} text-ink-faint cursor-default`}
        />
      </label>
    </div>
  );
}
