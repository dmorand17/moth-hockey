import Link from "next/link";
import { GameList, GameRow } from "@/components/GameRow";
import { SectionHeader } from "@/components/SectionHeader";
import { formatShortDate } from "@/lib/format";
import type { SeasonTotals } from "@/lib/season-finalize";
import { describeMoment, topGoalies, topSkaters, type Moment, type Names, type RecapGame, type SeasonNumbers } from "@/lib/season-recap";

export type Team = { id: string; name: string; slug: string; color: string };
export type { Names };

const Dot = ({ color }: { color: string }) => (
  <span aria-hidden className="swatch h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
);

const ref = (t: Team | undefined) => (t ? { name: t.name, slug: t.slug, color: t.color } : null);

// Shared row for game lists on the recap (needs team refs from the season map).
export function RecapGameRow({ game, names, showDate = true }: { game: RecapGame; names: Names; showDate?: boolean }) {
  return (
    <GameRow
      id={game.id}
      scheduled_at={game.scheduled_at}
      status={game.status}
      home_team={ref(names.teams.get(game.home_team_id ?? ""))}
      away_team={ref(names.teams.get(game.away_team_id ?? ""))}
      home_score={game.home_score}
      away_score={game.away_score}
      decided_in={game.decided_in as "regulation" | "ot" | "shootout" | null}
      kind={game.kind}
      playoff_round={game.playoff_round as "sf1" | "sf2" | "final" | null}
      showDate={showDate}
    />
  );
}

export function RecapNumbers({ eyebrow, numbers }: { eyebrow: string; numbers: SeasonNumbers }) {
  const tiles: [string, string | number][] = [
    ["Games", numbers.games],
    ["Goals", numbers.goals],
    ["Goals / game", numbers.goalsPerGame.toFixed(1)],
    ["Overtime", numbers.overtime],
    ["Shootouts", numbers.shootouts],
    ["Penalties", numbers.penalties],
  ];
  return (
    <section>
      <SectionHeader eyebrow={eyebrow} title="By the numbers" />
      <dl className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="panel p-3 sm:p-4">
            <dt className="eyebrow">{label}</dt>
            <dd className="digit mt-1 text-[24px] sm:text-[28px] leading-none text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function LeaderList({
  title,
  rows,
  value,
  unit,
  names,
}: {
  title: string;
  rows: SeasonTotals[];
  value: (t: SeasonTotals) => string;
  unit: string;
  names: Names;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="panel overflow-clip">
      <h3 className="px-4 py-2 bg-board-3 border-b border-rule eyebrow">{title}</h3>
      <ol className="divide-y divide-rule">
        {rows.map((t, i) => {
          const player = names.players.get(t.player_id);
          const team = names.teams.get(t.team_id);
          return (
            <li key={t.player_id} className="flex items-center gap-3 px-4">
              <span className={`tnum w-4 text-[14px] ${i === 0 ? "text-gold font-bold" : "text-ink-faint"}`}>{i + 1}</span>
              <Link
                href={`/players/${t.player_id}`}
                className="flex-1 min-w-0 flex flex-col justify-center min-h-[48px] hover:text-ice transition-colors"
              >
                <span className="text-[15px] font-semibold leading-5 text-ink">{player?.name ?? "Unknown player"}</span>
                {team && (
                  <span className="flex items-center gap-1.5 text-[12px] text-ink-faint">
                    <Dot color={team.color} />
                    {team.name}
                  </span>
                )}
              </Link>
              <span className="text-right shrink-0">
                <span className={`digit text-[18px] ${i === 0 ? "text-gold" : "text-ink"}`}>{value(t)}</span>
                <span className="ml-1 text-[12px] font-semibold text-ink-faint">{unit}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const pts = (t: SeasonTotals) => String(t.goals + t.assists);
const gaa = (t: SeasonTotals) => ((t.goals_against ?? 0) / t.games_played).toFixed(2);

export function RecapLeaders({
  eyebrow,
  totals,
  minGoalieGames,
  names,
  skaterKeys = ["points", "goals", "assists"],
}: {
  eyebrow: string;
  totals: SeasonTotals[];
  minGoalieGames: number;
  names: Names;
  skaterKeys?: ("points" | "goals" | "assists")[];
}) {
  const goalies = topGoalies(totals, minGoalieGames);
  const lists = skaterKeys.map((k) => ({
    key: k,
    title: k === "points" ? "Points" : k === "goals" ? "Goals" : "Assists",
    rows: topSkaters(totals, k),
    value: k === "points" ? pts : (t: SeasonTotals) => String(t[k]),
    unit: k === "points" ? "PTS" : k === "goals" ? "G" : "A",
  }));
  if (lists.every((l) => l.rows.length === 0) && goalies.length === 0) return null;
  return (
    <section>
      <SectionHeader eyebrow={eyebrow} title="Leaders" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {lists.map((l) => (
          <LeaderList key={l.key} title={l.title} rows={l.rows} value={l.value} unit={l.unit} names={names} />
        ))}
        <LeaderList title="Goalies · GAA" rows={goalies} value={gaa} unit="GAA" names={names} />
      </div>
    </section>
  );
}

export function RecapMoments({ eyebrow, moments, games, names }: { eyebrow: string; moments: Moment[]; games: RecapGame[]; names: Names }) {
  if (moments.length === 0) return null;
  const byId = new Map(games.map((g) => [g.id, g]));
  const player = (id: string) => names.players.get(id)?.name ?? "A player";
  const team = (id: string | null) => (id ? names.teams.get(id)?.name : undefined) ?? "TBD";
  return (
    <section>
      <SectionHeader eyebrow={eyebrow} title="Notable moments" />
      <ul className="grid gap-2 sm:grid-cols-2 items-start">
        {moments.map((m, i) => {
          const key = `${m.kind}-${m.gameId}-${m.playerId ?? m.teamId}-${i}`;
          const { label, text } = describeMoment(m, byId.get(m.gameId ?? ""), names, byId);

          // Collapsed cards: one row per player (hat tricks) or per game (big nights).
          if (m.kind === "hat-tricks" || m.kind === "big-nights") {
            return (
              <li key={key} className="panel p-3 sm:p-4">
                <span className="eyebrow">{label}</span>
                <ul className="mt-1 divide-y divide-rule">
                  {m.kind === "hat-tricks"
                    ? (m.players ?? []).map((p) => (
                        <li key={p.playerId} className="flex items-center justify-between gap-3 min-h-11 text-[15px]">
                          <Link href={`/players/${p.playerId}`} className="font-semibold text-ink hover:text-ice truncate">
                            {player(p.playerId)}
                          </Link>
                          {p.count > 1 && <span className="tnum text-ink-dim">×{p.count}</span>}
                        </li>
                      ))
                    : (m.nights ?? []).map((n) => {
                        const g = byId.get(n.gameId);
                        return (
                          <li key={`${n.gameId}-${n.playerId}`}>
                            <Link href={`/games/${n.gameId}`} className="flex items-center justify-between gap-3 min-h-11 py-1.5 group">
                              <span className="min-w-0">
                                <span className="block text-[15px] font-semibold text-ink group-hover:text-ice">
                                  {player(n.playerId)} — <span className="tnum">{n.goals}</span> goals
                                </span>
                                {g && (
                                  <span className="block text-[13px] text-ink-faint tnum truncate">
                                    {team(g.away_team_id)} {g.away_score} – {g.home_score} {team(g.home_team_id)} · {formatShortDate(g.scheduled_at)}
                                  </span>
                                )}
                              </span>
                              <span aria-hidden className="text-ink-faint group-hover:text-ice">→</span>
                            </Link>
                          </li>
                        );
                      })}
                </ul>
              </li>
            );
          }

          const body = (
            <>
              <span className="eyebrow">{label}</span>
              <span className="mt-0.5 block text-[15px] leading-5 text-ink">{text}</span>
            </>
          );
          return (
            <li key={key}>
              {m.gameId ? (
                <Link href={`/games/${m.gameId}`} className="panel block p-3 sm:p-4 hover:bg-board-hover hover:border-rule-strong transition-colors">
                  {body}
                </Link>
              ) : (
                <div className="panel p-3 sm:p-4">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function RecapPath({ path, names }: { path: RecapGame[]; names: Names }) {
  return (
    <GameList>
      {path.map((g) => (
        <RecapGameRow key={g.id} game={g} names={names} />
      ))}
    </GameList>
  );
}
