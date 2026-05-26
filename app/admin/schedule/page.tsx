import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import { COMMON_GAME_TIMES } from "@/lib/schedule-config";
import { createGame, updateGame, deleteGame } from "./actions";

type SearchParams = Promise<{ saved?: string; error?: string }>;

const FLASH_MESSAGES: Record<string, string> = {
  created: "Game created.",
  updated: "Game updated.",
  deleted: "Game deleted.",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Check all required fields (home team ≠ away team, valid date).",
};

type TeamRef = { id: string; name: string; color: string };

type GameRow = {
  id: string;
  scheduled_at: string;
  location: string | null;
  status: "scheduled" | "live" | "final";
  home_score: number;
  away_score: number;
  decided_in: "regulation" | "ot" | "shootout" | null;
  home_team: TeamRef;
  away_team: TeamRef;
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

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();

  const params = await searchParams;

  const [{ data: teams }, { data: gamesRaw }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, color")
      .eq("season_id", season.id)
      .order("name"),
    supabase
      .from("games")
      .select(
        "id, scheduled_at, location, status, home_score, away_score, decided_in, home_team:home_team_id(id, name, color), away_team:away_team_id(id, name, color)",
      )
      .eq("season_id", season.id)
      .order("scheduled_at"),
  ]);

  const games = (gamesRaw ?? []) as unknown as GameRow[];
  const teamList = (teams ?? []) as TeamRef[];

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

            <label className="block flex-1 min-w-[160px]">
              <span className="eyebrow">Date</span>
              <input
                type="date"
                name="scheduled_date"
                required
                className={`mt-1 ${inputCls}`}
              />
            </label>

            <label className="block min-w-[140px]">
              <span className="eyebrow">Time</span>
              <select name="scheduled_time" required className={`mt-1 ${inputCls}`}>
                {COMMON_GAME_TIMES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
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

      {/* Game list */}
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
          games.map((game) => (
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
                    style={{ background: game.home_team.color }}
                  />
                  <span className="text-ink text-[13px]">
                    {game.home_team.name}
                  </span>
                  <span className="text-ink-faint text-[11px]">vs</span>
                  <span
                    className="h-2 w-2 rounded-sm shrink-0"
                    style={{ background: game.away_team.color }}
                  />
                  <span className="text-ink text-[13px]">
                    {game.away_team.name}
                  </span>
                </span>

                <span className="shrink-0 flex items-center gap-2">
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

                    <label className="block min-w-[140px]">
                      <span className="eyebrow">Time</span>
                      <select
                        name="scheduled_time"
                        key={game.id + "-time"}
                        defaultValue={
                          COMMON_GAME_TIMES.find(
                            (t) => t.value === toLocalTime(game.scheduled_at),
                          )?.value ?? COMMON_GAME_TIMES[0].value
                        }
                        className={`mt-1 ${inputCls}`}
                      >
                        {COMMON_GAME_TIMES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                        {/* Show current time as option if it's not a common slot */}
                        {!COMMON_GAME_TIMES.find(
                          (t) => t.value === toLocalTime(game.scheduled_at),
                        ) && (
                          <option value={toLocalTime(game.scheduled_at)}>
                            {formatLocalTime(game.scheduled_at)} (current)
                          </option>
                        )}
                      </select>
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
                          style={{ background: game.home_team.color }}
                        />
                        {game.home_team.name} score
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
                          style={{ background: game.away_team.color }}
                        />
                        {game.away_team.name} score
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
                        className="min-h-11 px-4 bg-board-3 hover:bg-rule border border-rule text-ink-dim hover:text-ink font-display tracking-[0.14em] text-[13px] rounded transition-colors"
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
          ))
        )}
      </section>
    </div>
  );
}
