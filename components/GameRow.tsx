import Link from "next/link";
import { PlayoffChip } from "./PlayoffChip";
import { StatusChip } from "./Chips";
import { formatDate } from "@/lib/format";

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
  playoff_round?: "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final" | null;
  /** Show the date (for lists that aren't already grouped by date). */
  showDate?: boolean;
  /** Keep the two-line layout at every width (for narrow columns). */
  stacked?: boolean;
};

type Side = { team: Team | null; score: number | null | undefined; won: boolean };

function Bar({ team }: { team: Team | null }) {
  return (
    <span
      aria-hidden
      className="swatch w-1 h-4 shrink-0 rounded-[1px]"
      style={{ background: team?.color ?? "var(--rule-strong)" }}
    />
  );
}

function teamTone(side: Side, isFinal: boolean) {
  if (!side.team) return "text-ink-faint";
  if (!isFinal) return "text-ink";
  return side.won ? "text-ink font-semibold" : "text-ink-dim";
}

function scoreTone(side: Side) {
  return side.won ? "text-ink" : "text-ink-faint";
}

// One game in a list: a dense two-line row on mobile, a single line
// (Away score – score Home) from `sm` up unless `stacked`. The whole row links to the game.
// Place inside a <ul className="divide-y ..."> list container.
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
  showDate = false,
  stacked = false,
}: Props) {
  const isFinal = status === "final";
  const showScore = isFinal || status === "live";
  const away: Side = {
    team: away_team,
    score: away_score,
    won: isFinal && (away_score ?? 0) > (home_score ?? 0),
  };
  const home: Side = {
    team: home_team,
    score: home_score,
    won: isFinal && (home_score ?? 0) > (away_score ?? 0),
  };
  const awayName = away_team?.name ?? "TBD";
  const homeName = home_team?.name ?? "TBD";
  const label = showScore
    ? `${awayName} ${away_score ?? 0}, ${homeName} ${home_score ?? 0}`
    : `${awayName} at ${homeName}`;

  const status_ = (
    <StatusChip status={status} decidedIn={decided_in} scheduledAt={scheduled_at} />
  );
  const playoff = kind === "playoff" && <PlayoffChip round={playoff_round} size="sm" />;

  return (
    <li>
      <Link
        href={`/games/${id}`}
        aria-label={`${label} — ${formatDate(scheduled_at)}`}
        className="block px-3 sm:px-4 py-2.5 hover:bg-board-hover transition-colors"
      >
        {/* Mobile: two stacked team lines + status column */}
        <div className={`${stacked ? "" : "sm:hidden "}flex items-center gap-3`}>
          <div className="flex-1 min-w-0 space-y-1">
            {[away, home].map((side, i) => (
              <div key={i} className="flex items-center gap-2">
                <Bar team={side.team} />
                <span className={`flex-1 min-w-0 truncate text-[15px] ${teamTone(side, isFinal)}`}>
                  {side.team?.name ?? "TBD"}
                </span>
                {showScore && (
                  <span className={`digit text-[17px] w-6 text-right ${scoreTone(side)}`}>
                    {side.score ?? 0}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="shrink-0 w-[5.5rem] flex flex-col items-end gap-1 text-right">
            {status_}
            {showDate && <span className="text-[12px] text-ink-faint">{formatDate(scheduled_at)}</span>}
            {playoff}
          </div>
        </div>

        {/* sm+: single line */}
        {!stacked && (
          <div
            className={`hidden sm:grid items-center gap-3 ${
              showDate ? "grid-cols-[6.5rem_1fr_4.5rem_1fr_6.5rem]" : "grid-cols-[1fr_4.5rem_1fr_6.5rem]"
            }`}
          >
            {showDate && <span className="text-[14px] text-ink-faint">{formatDate(scheduled_at)}</span>}
            <span className="flex items-center justify-end gap-2 min-w-0">
              <span className={`truncate text-[15px] ${teamTone(away, isFinal)}`}>{awayName}</span>
              <Bar team={away_team} />
            </span>
            <span className="digit text-[17px] text-center whitespace-nowrap">
              {showScore ? (
                <>
                  <span className={scoreTone(away)}>{away_score ?? 0}</span>
                  <span className="text-ink-faint mx-1.5" aria-hidden>–</span>
                  <span className={scoreTone(home)}>{home_score ?? 0}</span>
                </>
              ) : (
                <span className="text-[13px] font-semibold text-ink-faint">at</span>
              )}
            </span>
            <span className="flex items-center gap-2 min-w-0">
              <Bar team={home_team} />
              <span className={`truncate text-[15px] ${teamTone(home, isFinal)}`}>{homeName}</span>
            </span>
            <span className="flex items-center justify-end gap-1.5">
              {playoff}
              {status_}
            </span>
          </div>
        )}
      </Link>
    </li>
  );
}

// List container for GameRows.
export function GameList({ children }: { children: React.ReactNode }) {
  return <ul className="panel overflow-clip divide-y divide-rule">{children}</ul>;
}
