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
      <span className="eyebrow">Season</span>
      <select
        value={selectedId}
        onChange={(e) => router.push(`${pathname}?season=${e.target.value}`)}
        className="bg-board-2 border border-rule-strong text-ink text-[15px] font-semibold px-3 rounded-md min-h-[44px] max-w-[200px] hover:border-ink-faint transition-colors"
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
