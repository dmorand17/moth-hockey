import Link from "next/link";
import type { ReactNode } from "react";
import { Disclosure } from "./Disclosure";
import { ScrollFade } from "./ScrollFade";
import { AWARD_PALETTE, DEFAULT_AWARD_STYLE, HEADLINE_AWARDS, tieSummary, type AwardWinnerGroup } from "@/lib/awards";

type Totals = { player_id: string; goals: number; assists: number; penalties: number }[];

export type { AwardWinnerGroup };

// "grid": 2 columns (beside the stats leaders on desktop); "row": a
// horizontal snap strip of fixed-width cards (phones).
// An award shared by 3+ players collapses to one expandable "N tied" line.
export function AwardWinners({ awards, layout = "grid", totals = [] }: { awards: AwardWinnerGroup[]; layout?: "grid" | "row"; totals?: Totals }) {
  if (awards.length === 0) return null;

  return (
    // Two or fewer awards don't need a swipe row on narrow phones: stack them.
    <Wrap layout={layout} stack={layout === "row" && awards.length <= 2}>
      {awards.map(({ type, label, winners }) => {
        const style = AWARD_PALETTE[type] ?? DEFAULT_AWARD_STYLE;
        const headline = HEADLINE_AWARDS.has(type);
        return (
          <div
            key={type}
            className={`panel-bare p-3 sm:p-4 flex items-start gap-3 ${layout === "row" ? `w-[220px] shrink-0 ${awards.length <= 2 ? "max-[399px]:w-full" : ""}` : ""}`}
            style={{ borderColor: style.border }}
          >
            <span
              aria-hidden
              className={`h-9 w-9 shrink-0 rounded-md border flex items-center justify-center text-[16px] text-gold ${
                headline ? "bg-gold/10 border-gold/40" : "bg-board-3 border-rule"
              }`}
            >
              {style.star}
            </span>
            <div className="min-w-0">
              <div className="eyebrow" style={{ color: style.fg }}>
                {label}
              </div>
              {winners.length >= 3 ? (
                <Disclosure label={tieSummary(type, winners.map((w) => w.id), totals)}>
                  <WinnerList winners={winners} />
                </Disclosure>
              ) : (
                <WinnerList winners={winners} />
              )}
            </div>
          </div>
        );
      })}
    </Wrap>
  );
}

function WinnerList({ winners }: { winners: AwardWinnerGroup["winners"] }) {
  return (
    <ul className="mt-0.5 flex flex-col">
      {winners.map((w) => (
        <li key={w.id}>
          <Link
            href={`/players/${w.id}`}
            className="text-[16px] font-semibold leading-6 text-ink hover:text-ice transition-colors inline-flex items-center min-h-[44px]"
          >
            {w.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Wrap({ layout, stack = false, children }: { layout: "grid" | "row"; stack?: boolean; children: ReactNode }) {
  if (layout === "grid") return <div className="grid grid-cols-2 gap-2 sm:gap-3">{children}</div>;
  return (
    <ScrollFade className="-mx-4 sm:mx-0">
      <div className={`flex gap-3 px-4 sm:px-0 pb-1 ${stack ? "max-[399px]:flex-col" : ""}`}>{children}</div>
    </ScrollFade>
  );
}
