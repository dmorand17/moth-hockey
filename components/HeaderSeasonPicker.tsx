"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { setSelectedSeason } from "@/app/season-actions";
import { shortSeasonName } from "@/lib/seasons";

type SeasonOption = { id: string; name: string; is_current: boolean };

// Site-wide season picker in the header. The choice is kept in a cookie so
// every page follows it; a ?season= in the URL (a shared link) shows instead
// until the picker is used again.
export function HeaderSeasonPicker({
  seasons,
  cookieSeasonId,
}: {
  seasons: SeasonOption[];
  cookieSeasonId: string | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const known = (id: string | null | undefined) => (id && seasons.some((s) => s.id === id) ? id : undefined);
  const current = seasons.find((s) => s.is_current) ?? seasons[0];
  const selectedId = known(searchParams.get("season")) ?? known(cookieSeasonId) ?? current.id;
  const isPast = selectedId !== current.id;

  const onChange = (id: string) =>
    startTransition(async () => {
      await setSelectedSeason(id === current.id ? null : id);
      // The cookie now carries the season; drop a stale ?season= from the URL.
      const params = new URLSearchParams(searchParams.toString());
      params.delete("season");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      router.refresh();
    });

  // Closed, it shows a compact label ("Spr '25"); the native select sits on
  // top, invisible, so tapping opens the full list of season names.
  const selected = seasons.find((s) => s.id === selectedId) ?? current;
  return (
    <span
      className={`relative inline-flex items-center gap-1 rounded-md border bg-board-2 px-2 min-h-[44px] text-[13px] font-semibold whitespace-nowrap transition-colors focus-within:ring-2 focus-within:ring-ice ${
        isPast ? "border-gold text-gold" : "border-rule-strong text-ink hover:border-ink-faint"
      } ${pending ? "opacity-60" : ""}`}
    >
      {shortSeasonName(selected.name)}
      <svg viewBox="0 0 10 6" aria-hidden className="h-1.5 w-2.5 shrink-0">
        <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
      <select
        aria-label="Season"
        value={selectedId}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </span>
  );
}
