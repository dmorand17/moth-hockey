"use client";

import { useState } from "react";

const inputCls =
  "bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice w-full";

const TYPES: { value: string; label: string }[] = [
  { value: "spring", label: "Spring" },
  { value: "summer", label: "Summer" },
  { value: "fall", label: "Fall" },
  { value: "winter", label: "Winter" },
];

const autoName = (type: string, year: string) => {
  const label = TYPES.find((t) => t.value === type)?.label ?? type;
  return year ? `${label} ${year}` : label;
};

// Type + Year + Name. The name auto-fills from "{Type} {Year}" until the admin
// edits it by hand, then it's left alone. Field names match the server action.
export function SeasonIdentityFields({ currentYear }: { currentYear: number }) {
  const [type, setType] = useState("spring");
  const [year, setYear] = useState(String(currentYear));
  const [name, setName] = useState(autoName("spring", String(currentYear)));
  const [nameEdited, setNameEdited] = useState(false);

  const syncName = (t: string, y: string) => {
    if (!nameEdited) setName(autoName(t, y));
  };

  return (
    <div className="flex flex-wrap gap-3">
      <label className="block w-full sm:w-auto sm:min-w-[140px]">
        <span className="eyebrow">Type</span>
        <select
          name="season_type"
          required
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            syncName(e.target.value, year);
          }}
          className={`mt-1 ${inputCls}`}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block w-full sm:w-auto sm:min-w-[110px]">
        <span className="eyebrow">Year</span>
        <input
          type="number"
          name="year"
          required
          value={year}
          min={2000}
          max={2100}
          onChange={(e) => {
            setYear(e.target.value);
            syncName(type, e.target.value);
          }}
          className={`mt-1 ${inputCls}`}
        />
      </label>

      <label className="block flex-1 min-w-[180px]">
        <span className="eyebrow">Name</span>
        <input
          type="text"
          name="name"
          required
          value={name}
          placeholder={autoName(type, year)}
          onChange={(e) => {
            setName(e.target.value);
            setNameEdited(true);
          }}
          className={`mt-1 ${inputCls}`}
        />
      </label>
    </div>
  );
}
