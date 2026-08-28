import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { COMMON_GAME_TIMES } from "@/lib/schedule-config";
import { createGame, updateGame, deleteGame, skipWeek, removeScheduleSkip } from "./actions";
import { localDateKey, byeTeamNamesByDate } from "@/lib/season-schedule";
import { TimeSelect } from "./TimeSelect";

type SearchParams = Promise<{ saved?: string; error?: string }>;

const FLASH_MESSAGES: Record<string, string> = {
  created: "Game created.",
  updated: "Game updated.",
  deleted: "Game deleted.",
  skipped: "Week skipped — later games moved out a week.",
  skip_removed: "Skip note removed.",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Check all required fields (home team ≠ away team, valid date).",
  already_skipped: "That week is already recorded as skipped.",
  same_team: "Home and away team must be different.",
};

type TeamRef = { id: string; name: string; color: string };

type GameRow = {
  id: string;
  scheduled_at: string;
  location: string | null;
  status: "scheduled" | "live" | "final";
  kind: "regular" | "playoff";
  playoff_round: "sf1" | "sf2" | "final" | null;
  home_score: number;
  away_score: number;
  decided_in: "regulation" | "ot" | "shootout" | null;
  home_team: TeamRef | null;
  away_team: TeamRef | null;
};

const inputCls =
  "bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice w-full";

const statusLabel: Record<string, string> = {
  scheduled: "Scheduled",
  live: "Live",
  final: "Final",
};

const decidedLabel: Record<string, string> = {
  regulation: "Regulation",
  ot: "OT",
  shootout: "Shootout",
};

/** "YYYY-MM-DD" in local time for a date input */
function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

/** "HH:mm" in local time for a time select/input */
function toLocalTime(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(11, 16);
}

/** "8:20 PM" style label for a stored timestamp */
function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Format for display in the summary row */
function formatGameDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Sunday, March 1" from a "YYYY-MM-DD" local date key */
function formatWeekLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();
  if (!season) return <NoSeason isAdmin />;

  const params = await searchParams;

  const [{ data: teams }, { data: gamesRaw }, { data: skips }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, color")
      .eq("season_id", season.id)
      .order("name"),
    supabase
      .from("games")
      .select(
        "id, scheduled_at, location, status, kind, playoff_round, home_score, away_score, decided_in, home_team:home_team_id(id, name, color), away_team:away_team_id(id, name, color)",
      )
      .eq("season_id", season.id)
      .order("scheduled_at"),
    supabase
      .from("schedule_skips")
      .select("id, skip_date, reason")
      .eq("season_id", season.id)
      .order("skip_date"),
  ]);

  const games = (gamesRaw ?? []) as unknown as GameRow[];
  const teamList = (teams ?? []) as TeamRef[];

  const byesByDate = byeTeamNamesByDate(
    (teams ?? []).map((t) => ({ id: t.id, name: t.name })),
    games
      .filter((g) => g.kind === "regular")
      .map((g) => ({
        localDate: localDateKey(g.scheduled_at),
        homeTeamId: g.home_team?.id ?? null,
        awayTeamId: g.away_team?.id ?? null,
      })),
  );
  const skipList = skips ?? [];

  // Group games into weekly game-nights (local date), oldest first.
  const gamesByDate = new Map<string, GameRow[]>();
  for (const g of games) {
    const k = localDateKey(g.scheduled_at);
    const arr = gamesByDate.get(k);
    if (arr) arr.push(g);
    else gamesByDate.set(k, [g]);
  }
  const weekGroups = Array.from(gamesByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, weekGames]) => ({ date, weekGames }));

  return (
    <div className="space-y-8">
      {params.saved && (
        <p role="status" className="text-ice text-sm">
          {FLASH_MESSAGES[params.saved] ?? "Saved."}
        </p>
      )}
      {params.error && (
        <p role="alert" className="text-goal text-sm">
          {ERROR_MESSAGES[params.error] ?? params.error}
        </p>
      )}

      {/* Create */}
      <section className="space-y-3">
        <header className="flex items-baseline gap-3">
          <h2 className="font-display text-xl tracking-[0.04em] text-ink">
            NEW GAME
          </h2>
          <span className="eyebrow">{season.name}</span>
        </header>

        <form action={createGame} className="panel p-4 space-y-3">
          <input type="hidden" name="season_id" value={season.id} />
          <div className="flex flex-wrap gap-3">
            <label className="block flex-1 min-w-[160px]">
              <span className="eyebrow">Home team</span>
              <select name="home_team_id" required className={`mt-1 ${inputCls}`}>
                <option value="">— select —</option>
                {teamList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block flex-1 min-w-[160px]">
              <span className="eyebrow">Away team</span>
              <select name="away_team_id" required className={`mt-1 ${inputCls}`}>
                <option value="">— select —</option>
                {teamList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block w-full sm:w-auto sm:flex-1 sm:min-w-[140px]">
              <span className="eyebrow">Date</span>
              <input
                type="date"
                name="scheduled_date"
                required
                className={`mt-1 ${inputCls}`}
              />
            </label>

            <label className="block w-full sm:w-auto sm:min-w-[140px]">
              <span className="eyebrow">Time</span>
              <div className="mt-1">
                <TimeSelect />
              </div>
            </label>

            <label className="block flex-1 min-w-[180px]">
              <span className="eyebrow">Location (optional)</span>
              <input
                type="text"
                name="location"
                placeholder="Ice Plex Rink 1"
                className={`mt-1 ${inputCls}`}
              />
            </label>
          </div>

          <button
            type="submit"
            className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
          >
            CREATE
          </button>
        </form>
      </section>

      {/* Skip a week */}
      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink">
          SKIP A WEEK
        </h2>
        <form action={skipWeek} className="panel p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block w-full sm:w-auto sm:min-w-[160px]">
              <span className="eyebrow">Week of</span>
              <input type="date" name="skip_date" required className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block flex-1 min-w-[200px]">
              <span className="eyebrow">Reason</span>
              <input
                type="text"
                name="reason"
                required
                placeholder="Weather — rink closed"
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <button
              type="submit"
              className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors shrink-0"
            >
              SKIP
            </button>
          </div>
          <p className="text-ink-faint text-[12px]">
            Pushes every scheduled game on or after that date out by one week.
            Played (live/final) games are left in place.
          </p>
        </form>

        {skipList.length > 0 && (
          <ul className="border border-rule rounded divide-y divide-rule/50">
            {skipList.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-[13px] text-ink">
                  <span className="font-mono text-ink-dim">{s.skip_date}</span> — {s.reason}
                </span>
                <form action={removeScheduleSkip}>
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    className="px-2.5 py-1 min-h-8 text-goal border border-goal/40 hover:bg-goal/10 font-display tracking-[0.1em] text-[11px] rounded transition-colors"
                  >
                    REMOVE
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Game list — grouped by week, bye team shown per week */}
      <section className="space-y-1">
        <header className="flex items-baseline justify-between mb-2">
          <h2 className="font-display text-xl tracking-[0.04em] text-ink">
            SCHEDULE
          </h2>
          <span className="eyebrow">{games.length} games</span>
        </header>

        {games.length === 0 ? (
          <p className="text-ink-dim text-sm panel-bare p-4">
            No games scheduled yet.
          </p>
        ) : (
          <div className="space-y-5">
            {weekGroups.map(({ date, weekGames }) => (
              <div key={date} className="space-y-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="eyebrow text-goal">{formatWeekLabel(date)}</span>
                  <span className="flex-1 h-px bg-rule" />
                  {(byesByDate[date]?.length ?? 0) > 0 && (
                    <span className="eyebrow text-ink-faint">
                      Bye: {byesByDate[date].join(", ")}
                    </span>
                  )}
                </div>
                {weekGames.map((game) => (
            <details key={game.id} className="group border border-rule rounded">
              {/* Summary row */}
              <summary className="flex flex-wrap items-center gap-3 px-3 py-2.5 cursor-pointer list-none select-none hover:bg-board-3 transition-colors rounded">
                <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
                  ▶
                </span>

                <span className="text-ink-dim text-[12px] font-mono shrink-0 w-40">
                  {formatGameDate(game.scheduled_at)}
                </span>

                <span className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                  <span
                    className="h-2 w-2 rounded-sm shrink-0"
                    style={{ background: game.home_team?.color ?? "#3a4150" }}
                  />
                  <span className="text-ink text-[13px]">
                    {game.home_team?.name ?? "TBD"}
                  </span>
                  <span className="text-ink-faint text-[11px]">vs</span>
                  <span
                    className="h-2 w-2 rounded-sm shrink-0"
                    style={{ background: game.away_team?.color ?? "#3a4150" }}
                  />
                  <span className="text-ink text-[13px]">
                    {game.away_team?.name ?? "TBD"}
                  </span>
                </span>

                <span className="shrink-0 flex items-center gap-2">
                  {game.kind === "playoff" && (
                    <span className="chip chip-playoff text-[10px] px-1.5 py-0.5">
                      {game.playoff_round === "final"
                        ? "FINAL"
                        : (game.playoff_round?.toUpperCase() ?? "PYO")}
                    </span>
                  )}
                  {game.status === "final" ? (
                    <>
                      <span className="font-mono text-ink text-[13px]">
                        {game.home_score}–{game.away_score}
                      </span>
                      <span className="chip chip-final text-[10px] px-1.5 py-0.5">
                        {decidedLabel[game.decided_in ?? "regulation"]}
                      </span>
                    </>
                  ) : game.status === "live" ? (
                    <span className="chip chip-live text-[10px] px-1.5 py-0.5">
                      LIVE
                    </span>
                  ) : (
                    <span className="eyebrow text-ink-faint">Scheduled</span>
                  )}
                </span>
              </summary>

              {/* Edit form */}
              <div className="border-t border-rule px-3 py-3 space-y-3">
                <form action={updateGame} className="space-y-3">
                  <input type="hidden" name="id" value={game.id} />

                  <div className="flex flex-wrap gap-3">
                    <label className="block flex-1 min-w-[160px]">
                      <span className="eyebrow">Home team</span>
                      <select
                        name="home_team_id"
                        key={game.id + "-home"}
                        defaultValue={game.home_team?.id ?? ""}
                        className={`mt-1 ${inputCls}`}
                      >
                        <option value="">— TBD —</option>
                        {teamList.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block flex-1 min-w-[160px]">
                      <span className="eyebrow">Away team</span>
                      <select
                        name="away_team_id"
                        key={game.id + "-away"}
                        defaultValue={game.away_team?.id ?? ""}
                        className={`mt-1 ${inputCls}`}
                      >
                        <option value="">— TBD —</option>
                        {teamList.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <label className="block w-full sm:w-auto sm:flex-1 sm:min-w-[140px]">
                      <span className="eyebrow">Date</span>
                      <input
                        type="date"
                        name="scheduled_date"
                        key={game.id + "-date"}
                        defaultValue={toLocalDate(game.scheduled_at)}
                        required
                        className={`mt-1 ${inputCls}`}
                      />
                    </label>

                    <label className="block w-full sm:w-auto sm:min-w-[140px]">
                      <span className="eyebrow">Time</span>
                      <div className="mt-1">
                        <TimeSelect
                          key={game.id + "-time"}
                          defaultValue={toLocalTime(game.scheduled_at)}
                        />
                      </div>
                    </label>

                    <label className="block flex-1 min-w-[180px]">
                      <span className="eyebrow">Location</span>
                      <input
                        type="text"
                        name="location"
                        key={game.id + "-loc"}
                        defaultValue={game.location ?? ""}
                        placeholder="Ice Plex Rink 1"
                        className={`mt-1 ${inputCls}`}
                      />
                    </label>

                    <label className="block">
                      <span className="eyebrow">Status</span>
                      <select
                        name="status"
                        key={game.id + "-status"}
                        defaultValue={game.status}
                        className={`mt-1 ${inputCls}`}
                      >
                        <option value="scheduled">
                          {statusLabel.scheduled}
                        </option>
                        <option value="live">{statusLabel.live}</option>
                        <option value="final">{statusLabel.final}</option>
                      </select>
                    </label>
                  </div>

                  {/* Score — always visible for manual entry */}
                  <div className="flex flex-wrap gap-3 items-end">
                    <label className="block">
                      <span className="eyebrow">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-sm mr-1 align-middle"
                          style={{ background: game.home_team?.color ?? "#3a4150" }}
                        />
                        {game.home_team?.name ?? "TBD"} score
                      </span>
                      <input
                        type="number"
                        name="home_score"
                        key={game.id + "-hs"}
                        defaultValue={game.home_score}
                        min={0}
                        className={`mt-1 w-20 ${inputCls}`}
                      />
                    </label>

                    <label className="block">
                      <span className="eyebrow">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-sm mr-1 align-middle"
                          style={{ background: game.away_team?.color ?? "#3a4150" }}
                        />
                        {game.away_team?.name ?? "TBD"} score
                      </span>
                      <input
                        type="number"
                        name="away_score"
                        key={game.id + "-as"}
                        defaultValue={game.away_score}
                        min={0}
                        className={`mt-1 w-20 ${inputCls}`}
                      />
                    </label>

                    <label className="block">
                      <span className="eyebrow">Decided in</span>
                      <select
                        name="decided_in"
                        key={game.id + "-di"}
                        defaultValue={game.decided_in ?? "regulation"}
                        className={`mt-1 ${inputCls}`}
                      >
                        <option value="regulation">Regulation</option>
                        <option value="ot">OT</option>
                        <option value="shootout">Shootout</option>
                      </select>
                    </label>

                    <div className="pb-0.5">
                      <button
                        type="submit"
                        className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
                      >
                        SAVE
                      </button>
                    </div>
                  </div>
                </form>

                <form action={deleteGame}>
                  <input type="hidden" name="id" value={game.id} />
                  <button
                    type="submit"
                    className="text-goal/60 hover:text-goal font-display tracking-[0.1em] text-[12px] transition-colors"
                  >
                    DELETE GAME
                  </button>
                </form>
              </div>
            </details>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
