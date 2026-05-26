"use client";

import { useRouter, usePathname } from "next/navigation";

type SeasonOption = { id: string; name: string };

export function SeasonSelect({
  seasons,
  selectedId,
}: {
  seasons: SeasonOption[];
  selectedId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="inline-flex items-center gap-2">
      <span className="eyebrow text-[10px]">Season</span>
      <select
        value={selectedId}
        onChange={(e) => router.push(`${pathname}?season=${e.target.value}`)}
        className="bg-board-2 border border-rule-strong text-ink text-[12.5px] font-mono uppercase tracking-[0.1em] px-2 py-1.5 rounded-[2px] min-h-[36px] max-w-[200px]"
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
