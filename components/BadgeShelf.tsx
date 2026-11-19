"use client";

import { useState } from "react";
import {
  AWARD_PALETTE as PALETTE,
  DEFAULT_AWARD_STYLE as DEFAULT_STYLE,
  HEADLINE_AWARDS as HEADLINE,
} from "@/lib/awards";

type Award = {
  type: string;
  label: string;
  seasons: string[];
};

export function BadgeShelf({ awards }: { awards: Award[] }) {
  const [selectedType, setSelectedType] = useState<string | null>(awards[0]?.type ?? null);
  if (awards.length === 0) return null;

  const selected = awards.find((a) => a.type === selectedType) ?? awards[0];
  const selStyle = PALETTE[selected.type] ?? DEFAULT_STYLE;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
      {/* Details panel — shown on the left on desktop, below on mobile */}
      <div
        className="panel-bare p-3 min-h-[92px] order-2 md:order-1 flex flex-col justify-center"
        style={{ borderColor: selStyle.border }}
      >
        <div
          className="font-mono text-[10px] tracking-[0.18em] uppercase flex items-center gap-1.5"
          style={{ color: selStyle.fg }}
        >
          <span aria-hidden>{selStyle.star}</span>
          <span>{selected.label}</span>
          <span className="text-ink-faint">·</span>
          <span className="text-ink-faint">
            {selected.seasons.length} season{selected.seasons.length > 1 ? "s" : ""}
          </span>
        </div>
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {selected.seasons.map((s, i) => (
            <li key={`${s}-${i}`} className="text-[12px] text-ink-dim">
              {s}
            </li>
          ))}
        </ul>
      </div>

      {/* Badge stack */}
      <div className="flex flex-row md:flex-col flex-wrap gap-1.5 order-1 md:order-2">
        {awards.map(({ type, label, seasons }) => {
          const style = PALETTE[type] ?? DEFAULT_STYLE;
          const active = type === selected.type;
          const headline = HEADLINE.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              aria-pressed={active}
              aria-label={`${label}${seasons.length > 1 ? `, ${seasons.length} seasons` : ""}`}
              className={`inline-flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-md text-[12px] font-bold uppercase tracking-[0.06em] cursor-pointer transition-colors whitespace-nowrap ${
                active ? "bg-board-3" : "hover:bg-board-3"
              }`}
              style={{
                background: active ? undefined : style.bg,
                border: `1px solid ${headline || active ? "var(--gold)" : style.border}`,
                color: style.fg,
              }}
            >
              <span aria-hidden>{style.star}</span>
              <span>{label}</span>
              {seasons.length > 1 && <span className="num">×{seasons.length}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
