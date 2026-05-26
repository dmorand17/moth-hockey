import Link from "next/link";
import { TeamBadge } from "./TeamBadge";
import { PlayoffChip } from "./PlayoffChip";
import { formatDate, formatTime } from "@/lib/format";

type Team = { name: string; slug: string; color: string };

type Props = {
  id: string;
  scheduled_at: string;
  status: "scheduled" | "live" | "final";
  home_team: Team | null;
  away_team: Team | null;
  home_score?: number | null;
  away_score?: number | null;
  decided_in?: "regulation" | "ot" | "shootout" | null;
  kind?: "regular" | "playoff";
  playoff_round?: "sf1" | "sf2" | "final" | null;
};

function TbdBadge() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden
        className="w-1 h-5 shrink-0 rounded-[1px] bg-rule-strong"
      />
      <span className="text-[15px] font-medium tracking-tight text-ink-faint">
        TBD
      </span>
    </span>
  );
}

export function GameRow({
  id,
  scheduled_at,
  status,
  home_team,
  away_team,
  home_score,
  away_score,
  decided_in,
  kind,
  playoff_round,
}: Props) {
  const isFinal = status === "final";
  const isLive = status === "live";
  const homeWon = isFinal && (home_score ?? 0) > (away_score ?? 0);
  const awayWon = isFinal && (away_score ?? 0) > (home_score ?? 0);

  return (
    <Link
      href={`/games/${id}`}
      className="block panel hover:border-rule-strong transition-colors p-3 sm:p-4 group"
    >
      <div className="flex items-center justify-between gap-3 mb-2 sm:mb-3">
        <div className="eyebrow flex items-center gap-2 truncate">
          <span>{formatDate(scheduled_at)}</span>
          {!isFinal && !isLive && (
            <>
              <span className="text-rule-strong">·</span>
              <span className="text-ink-dim">{formatTime(scheduled_at)}</span>
            </>
          )}
          {kind === "playoff" && <PlayoffChip round={playoff_round} size="sm" />}
        </div>
        {isLive ? (
          <span className="chip chip-live">
            <span className="live-dot" /> LIVE
          </span>
        ) : isFinal ? (
          <span className="chip chip-final">
            FINAL{decided_in && decided_in !== "regulation" ? `/${decided_in.toUpperCase()}` : ""}
          </span>
        ) : (
          <span className="chip">UPCOMING</span>
        )}
      </div>
      <div className="space-y-1.5 sm:space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          {away_team ? (
            <TeamBadge {...away_team} asChild size="md" className={awayWon ? "text-ink" : isFinal ? "text-ink-dim" : ""} />
          ) : (
            <TbdBadge />
          )}
          {isFinal && (
            <span className={`digit text-xl sm:text-2xl ${awayWon ? "text-ink" : "text-ink-faint"}`}>
              {away_score}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          {home_team ? (
            <TeamBadge {...home_team} asChild size="md" className={homeWon ? "text-ink" : isFinal ? "text-ink-dim" : ""} />
          ) : (
            <TbdBadge />
          )}
          {isFinal && (
            <span className={`digit text-xl sm:text-2xl ${homeWon ? "text-ink" : "text-ink-faint"}`}>
              {home_score}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
