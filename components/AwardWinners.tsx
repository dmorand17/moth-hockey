import Link from "next/link";
import { AWARD_PALETTE, DEFAULT_AWARD_STYLE, HEADLINE_AWARDS } from "@/lib/awards";

export type AwardWinnerGroup = {
  type: string;
  label: string;
  winners: { id: string; name: string }[];
};

export function AwardWinners({ awards }: { awards: AwardWinnerGroup[] }) {
  if (awards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
      {awards.map(({ type, label, winners }) => {
        const style = AWARD_PALETTE[type] ?? DEFAULT_AWARD_STYLE;
        const headline = HEADLINE_AWARDS.has(type);
        return (
          <div
            key={type}
            className="panel-bare p-3 sm:p-4 flex items-start gap-3"
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
