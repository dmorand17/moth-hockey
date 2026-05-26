"use client";

import { useState } from "react";
import { COMMON_GAME_TIMES } from "@/lib/schedule-config";

const CUSTOM = "custom";

const inputCls =
  "bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice w-full";

export function TimeSelect({ defaultValue }: { defaultValue?: string }) {
  const isPreset = COMMON_GAME_TIMES.some((t) => t.value === defaultValue);
  const [value, setValue] = useState(
    defaultValue && !isPreset ? CUSTOM : (defaultValue ?? COMMON_GAME_TIMES[0].value),
  );

  return (
    <div className="space-y-2">
      <select
        name={value === CUSTOM ? undefined : "scheduled_time"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={inputCls}
      >
        {COMMON_GAME_TIMES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>
      {value === CUSTOM && (
        <input
          type="time"
          name="scheduled_time"
          required
          defaultValue={!isPreset ? defaultValue : undefined}
          className={inputCls}
        />
      )}
    </div>
  );
}
