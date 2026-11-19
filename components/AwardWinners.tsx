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
            className="panel-bare p-3 sm:p-4 flex flex-col gap-1.5"
            style={headline ? { borderColor: style.border } : undefined}
          >
            <div
              className="text-[12px] font-bold tracking-[0.06em] uppercase flex items-center gap-1.5 leading-4"
              style={{ color: style.fg }}
            >
              <span aria-hidden>{style.star}</span>
              <span>{label}</span>
            </div>
            <ul className="flex flex-col gap-0.5">
              {winners.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/players/${w.id}`}
                    className="text-[15px] text-ink hover:text-ice transition-colors inline-flex items-center min-h-[32px]"
                  >
                    {w.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
