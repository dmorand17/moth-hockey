import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { COMMON_GAME_TIMES } from "@/lib/schedule-config";
import { weekdayLabel, type WeekdayIdx } from "@/lib/season-schedule";
import { TimeSlotsField } from "./TimeSlotsField";
import { ResetSeasonButton } from "./ResetSeasonButton";
import {
  activateSeason,
  createSeason,
  deleteSeason,
  generateSchedule,
  resetSeason,
  seedPlayoffs,
  updateSeasonDates,
} from "./actions";

type SearchParams = Promise<{ saved?: string; error?: string; n?: string }>;

const inputCls =
  "bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice w-full";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Check all required fields.",
  not_enough_teams: "Need at least 2 teams in this season to generate a schedule.",
  cannot_delete_current: "Cannot delete the current season. Activate another first.",
  has_games: "Delete or move games before deleting the season.",
  no_playoff_stubs: "Generate the schedule with playoffs first to seed the bracket.",
};

const WEEKDAYS: WeekdayIdx[] = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

type SeasonRow = {
  id: string;
  season_type: "spring" | "fall" | "winter";
  year: number;
  name: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  period_length_minutes: number;
};

type AggRow = { season_id: string; n: number };

export default async function AdminSeasonsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["admin"]);
  const params = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: seasonsRaw } = await supabase
    .from("seasons")
    .select(
      "id, season_type, year, name, start_date, end_date, is_current, period_length_minutes",
    )
    .order("start_date", { ascending: false });

  const seasons = (seasonsRaw ?? []) as SeasonRow[];

  // Aggregate counts per season for the summary chips + playoff bracket details.
  const [{ data: teamRows }, { data: gameRows }, { data: playoffRows }] = await Promise.all([
    supabase.from("teams").select("season_id"),
    supabase.from("games").select("season_id, status, kind"),
    supabase
      .from("games")
      .select(
        "season_id, playoff_round, status, home_score, away_score, home_team:home_team_id(name, color), away_team:away_team_id(name, color)",
      )
      .eq("kind", "playoff")
      .order("playoff_round"),
  ]);

  const teamCounts = new Map<string, number>();
  for (const t of teamRows ?? []) {
    teamCounts.set(t.season_id, (teamCounts.get(t.season_id) ?? 0) + 1);
  }
  type GameAgg = AggRow & { final: number; regular_final: number };
  const gameCounts = new Map<string, GameAgg>();
  for (const g of gameRows ?? []) {
    const cur = gameCounts.get(g.season_id) ?? {
      season_id: g.season_id,
      n: 0,
      final: 0,
      regular_final: 0,
    };
    cur.n += 1;
    if (g.status === "final") {
      cur.final += 1;
      if (g.kind === "regular") cur.regular_final += 1;
    }
    gameCounts.set(g.season_id, cur);
  }

  type BracketSlot = {
    playoff_round: "sf1" | "sf2" | "final" | null;
    status: "scheduled" | "live" | "final";
    home_score: number;
    away_score: number;
    home_team: { name: string; color: string } | null;
    away_team: { name: string; color: string } | null;
  };
  const bracketBySeason = new Map<string, BracketSlot[]>();
  for (const p of (playoffRows ?? []) as unknown as Array<BracketSlot & { season_id: string }>) {
    const list = bracketBySeason.get(p.season_id) ?? [];
    list.push(p);
    bracketBySeason.set(p.season_id, list);
  }

  const flash =
    params.saved === "generated"
      ? `Generated ${params.n ?? "?"} games.`
      : params.saved === "seeded"
        ? `Bracket seeded — ${params.n ?? "0"} round(s) updated.`
        : params.saved === "reset"
        ? "Season reset — all games and results cleared."
        : params.saved === "dates"
          ? "Dates updated."
          : params.saved === "created"
            ? "Season created."
            : params.saved === "activated"
              ? "Season activated."
              : params.saved === "deleted"
                ? "Season deleted."
                : null;
  const error = params.error
    ? (ERROR_MESSAGES[params.error] ?? params.error)
    : null;

  const today = new Date();
  const currentYear = today.getFullYear();

  return (
    <div className="space-y-8">
      {flash && (
        <p role="status" className="text-ice text-sm">
          {flash}
        </p>
      )}
      {error && (
        <p role="alert" className="text-goal text-sm">
          {error}
        </p>
      )}

      {/* Create */}
      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <h2 className="font-display text-xl tracking-[0.04em] text-ink">
            NEW SEASON
          </h2>
        </header>

        <form action={createSeason} className="panel p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <label className="block w-full sm:w-auto sm:min-w-[140px]">
              <span className="eyebrow">Type</span>
              <select name="season_type" required className={`mt-1 ${inputCls}`}>
                <option value="spring">Spring</option>
                <option value="fall">Fall</option>
                <option value="winter">Winter</option>
              </select>
            </label>
            <label className="block w-full sm:w-auto sm:min-w-[110px]">
              <span className="eyebrow">Year</span>
              <input
                type="number"
                name="year"
                required
                defaultValue={currentYear}
                min={2000}
                max={2100}
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className="block flex-1 min-w-[180px]">
              <span className="eyebrow">Name</span>
              <input
                type="text"
                name="name"
                required
                placeholder={`Spring ${currentYear}`}
                className={`mt-1 ${inputCls}`}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="block w-full sm:w-auto sm:flex-1 sm:min-w-[150px]">
              <span className="eyebrow">Start date</span>
              <input
                type="date"
                name="start_date"
                required
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className="block w-full sm:w-auto sm:flex-1 sm:min-w-[150px]">
              <span className="eyebrow">End date (optional)</span>
              <input
                type="date"
                name="end_date"
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className="block w-full sm:w-auto sm:min-w-[140px]">
              <span className="eyebrow">Period (min)</span>
              <input
                type="number"
                name="period_length_minutes"
                defaultValue={17}
                min={1}
                max={60}
                className={`mt-1 ${inputCls}`}
              />
            </label>
          </div>

          <label className="block">
            <span className="eyebrow">Copy teams from (optional)</span>
            <select name="copy_from_season_id" className={`mt-1 ${inputCls}`}>
              <option value="">— No carryover —</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.is_current ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>

          <p className="text-ink-faint text-[12px] leading-relaxed">
            Carryover copies team rows (name, color, slug) only — rosters and
            captains are reassigned each season. The new season is created{" "}
            <strong>inactive</strong>; activate it from the list below when
            ready.
          </p>

          <button
            type="submit"
            className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
          >
            CREATE
          </button>
        </form>
      </section>

      {/* Season list */}
      <section className="space-y-1">
        <header className="flex items-baseline justify-between mb-2">
          <h2 className="font-display text-xl tracking-[0.04em] text-ink">
            SEASONS
          </h2>
          <span className="eyebrow">{seasons.length} total</span>
        </header>

        {seasons.length === 0 ? (
          <p className="text-ink-dim text-sm panel-bare p-4">No seasons yet.</p>
        ) : (
          seasons.map((season) => {
            const teamCount = teamCounts.get(season.id) ?? 0;
            const gameAgg = gameCounts.get(season.id);
            const gameTotal = gameAgg?.n ?? 0;
            const finalCount = gameAgg?.final ?? 0;
            const regularFinalCount = gameAgg?.regular_final ?? 0;
            const canDelete = !season.is_current && gameTotal === 0;
            const bracket = bracketBySeason.get(season.id) ?? [];
            const sf1 = bracket.find((b) => b.playoff_round === "sf1") ?? null;
            const sf2 = bracket.find((b) => b.playoff_round === "sf2") ?? null;
            const finalSlot =
              bracket.find((b) => b.playoff_round === "final") ?? null;
            const hasPlayoffStubs = bracket.length > 0;
            const canSeed = hasPlayoffStubs && regularFinalCount > 0;

            return (
              <details
                key={season.id}
                className="group border border-rule rounded"
              >
                <summary className="flex flex-wrap items-center gap-3 px-3 py-2.5 cursor-pointer list-none select-none hover:bg-board-3 transition-colors rounded">
                  <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
                    ▶
                  </span>
                  <span className="font-display text-[14px] tracking-[0.04em] text-ink flex-1 min-w-[160px]">
                    {season.name.toUpperCase()}
                  </span>
                  {season.is_current && (
                    <span className="chip chip-live text-[10px] px-1.5 py-0.5 shrink-0">
                      CURRENT
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-ink-faint shrink-0">
                    {teamCount} TEAMS · {gameTotal} GAMES
                  </span>
                </summary>

                <div className="border-t border-rule p-4 space-y-4">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                    <dt className="eyebrow">Type</dt>
                    <dd className="font-mono text-ink-dim">
                      {season.season_type} · {season.year}
                    </dd>
                    <dt className="eyebrow">Start</dt>
                    <dd className="font-mono text-ink-dim">
                      {season.start_date}
                    </dd>
                    <dt className="eyebrow">End</dt>
                    <dd className="font-mono text-ink-dim">
                      {season.end_date ?? "—"}
                    </dd>
                    <dt className="eyebrow">Period</dt>
                    <dd className="font-mono text-ink-dim">
                      {season.period_length_minutes} min
                    </dd>
                    <dt className="eyebrow">Final games</dt>
                    <dd className="font-mono text-ink-dim">
                      {finalCount} of {gameTotal}
                    </dd>
                  </dl>

                  {/* Edit dates */}
                  <form
                    action={updateSeasonDates}
                    className="border-t border-rule/50 pt-3 space-y-3"
                  >
                    <input type="hidden" name="id" value={season.id} />
                    <div className="flex flex-wrap gap-3">
                      <label className="block w-full sm:w-auto sm:flex-1 sm:min-w-[150px]">
                        <span className="eyebrow">Start date</span>
                        <input
                          type="date"
                          name="start_date"
                          required
                          defaultValue={season.start_date}
                          className={`mt-1 ${inputCls}`}
                        />
                      </label>
                      <label className="block w-full sm:w-auto sm:flex-1 sm:min-w-[150px]">
                        <span className="eyebrow">End date (optional)</span>
                        <input
                          type="date"
                          name="end_date"
                          defaultValue={season.end_date ?? ""}
                          className={`mt-1 ${inputCls}`}
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
                    >
                      SAVE DATES
                    </button>
                    {gameTotal > 0 && (
                      <p className="text-ink-faint text-[11px]">
                        Editing dates here does not move the {gameTotal} existing
                        games — regenerate the schedule to reschedule them.
                      </p>
                    )}
                  </form>

                  {/* Activate */}
                  {!season.is_current && (
                    <form
                      action={activateSeason}
                      className="border-t border-rule/50 pt-3"
                    >
                      <input type="hidden" name="id" value={season.id} />
                      <button
                        type="submit"
                        className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
                      >
                        ACTIVATE {season.name.toUpperCase()}
                      </button>
                      <p className="text-ink-faint text-[11px] mt-2">
                        Switches the public site (standings, schedule, stats)
                        to this season.
                      </p>
                    </form>
                  )}

                  {/* Playoff bracket */}
                  {hasPlayoffStubs && (
                    <div className="border-t border-rule/50 pt-3 space-y-3">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-[13px] tracking-[0.14em] text-ice">
                          PLAYOFFS
                        </span>
                        <span className="chip chip-playoff text-[10px] px-1.5 py-0.5">
                          BRACKET
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <BracketRow label="SF1 (#1 v #4)" slot={sf1} />
                        <BracketRow label="SF2 (#2 v #3)" slot={sf2} />
                        <BracketRow label="Final" slot={finalSlot} />
                      </div>
                      <form action={seedPlayoffs} className="flex flex-wrap items-center gap-3">
                        <input type="hidden" name="season_id" value={season.id} />
                        <button
                          type="submit"
                          disabled={!canSeed}
                          className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title={
                            !canSeed
                              ? "Need final regular-season games to seed the bracket"
                              : undefined
                          }
                        >
                          SEED PLAYOFFS
                        </button>
                        <p className="text-ink-faint text-[11px]">
                          Idempotent — only fills rounds that aren&apos;t
                          already final. Final fills automatically once both
                          SFs are decided.
                        </p>
                      </form>
                    </div>
                  )}

                  {/* Generate schedule */}
                  <details className="border-t border-rule/50 pt-3">
                    <summary className="cursor-pointer list-none select-none">
                      <span className="font-display text-[13px] tracking-[0.14em] text-ice">
                        ▸ GENERATE SCHEDULE
                      </span>
                    </summary>
                    <form
                      action={generateSchedule}
                      className="mt-3 space-y-3 panel-bare p-3"
                    >
                      <input type="hidden" name="season_id" value={season.id} />

                      {gameTotal > 0 && (
                        <p className="text-goal/80 text-[12px]">
                          ⚠ This season already has {gameTotal} games.
                          Generating will delete all <em>scheduled</em> games
                          and replace them. Live and final games are kept.
                        </p>
                      )}
                      {teamCount < 2 && (
                        <p className="text-goal/80 text-[12px]">
                          Add at least 2 teams in /admin/teams before
                          generating.
                        </p>
                      )}

                      <div className="flex flex-wrap gap-3">
                        <label className="block w-full sm:w-auto sm:min-w-[140px]">
                          <span className="eyebrow">Weekday</span>
                          <select
                            name="weekday"
                            defaultValue="6"
                            className={`mt-1 ${inputCls}`}
                          >
                            {WEEKDAYS.map((w) => (
                              <option key={w} value={w}>
                                {weekdayLabel(w)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block w-full sm:w-auto sm:min-w-[100px]">
                          <span className="eyebrow">Weeks</span>
                          <input
                            type="number"
                            name="weeks"
                            defaultValue={10}
                            min={1}
                            max={52}
                            className={`mt-1 ${inputCls}`}
                          />
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

                      <TimeSlotsField
                        teamCount={teamCount}
                        defaultTimes={COMMON_GAME_TIMES.map((t) => t.value)}
                      />

                      <label className="inline-flex items-center gap-2 min-h-11">
                        <input
                          type="checkbox"
                          name="with_playoffs"
                          defaultChecked
                          className="size-4 accent-ice"
                        />
                        <span className="font-mono text-[13px] text-ink">
                          Reserve last 2 weeks for playoffs (top 4 → SF + Final)
                        </span>
                      </label>

                      <p className="text-ink-faint text-[12px]">
                        <strong>Weeks</strong> = how many game nights to schedule.
                        Each week fills the time slots below (one night), and teams
                        cycle through a balanced round-robin, repeating as needed
                        when the season runs longer than one round-robin. Playoffs
                        add 3 more games (SF1, SF2, Final) as TBD-vs-TBD stubs after
                        the final week.
                      </p>

                      <button
                        type="submit"
                        disabled={teamCount < 2}
                        className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        GENERATE
                      </button>
                    </form>
                  </details>

                  {/* Reset — wipe all games + results, keep teams/rosters */}
                  {gameTotal > 0 && (
                    <div className="border-t border-rule/50 pt-3">
                      <ResetSeasonButton
                        action={resetSeason}
                        seasonId={season.id}
                        seasonName={season.name}
                        gameTotal={gameTotal}
                      />
                      <p className="text-ink-faint text-[11px] mt-2">
                        Deletes all {gameTotal} games and their scores/stats for
                        this season. Teams and rosters are kept — regenerate the
                        schedule afterward.
                      </p>
                    </div>
                  )}

                  {/* Delete */}
                  <form
                    action={deleteSeason}
                    className="border-t border-rule/50 pt-3"
                  >
                    <input type="hidden" name="id" value={season.id} />
                    <button
                      type="submit"
                      disabled={!canDelete}
                      className="text-goal/60 hover:text-goal font-display tracking-[0.1em] text-[12px] transition-colors disabled:opacity-30 disabled:hover:text-goal/60 disabled:cursor-not-allowed"
                      title={
                        !canDelete
                          ? "Season must be inactive and have no games"
                          : undefined
                      }
                    >
                      DELETE SEASON
                    </button>
                  </form>
                </div>
              </details>
            );
          })
        )}
      </section>
    </div>
  );
}

function BracketRow({
  label,
  slot,
}: {
  label: string;
  slot: {
    status: "scheduled" | "live" | "final";
    home_score: number;
    away_score: number;
    home_team: { name: string; color: string } | null;
    away_team: { name: string; color: string } | null;
  } | null;
}) {
  const isFinal = slot?.status === "final";
  return (
    <div className="flex flex-wrap items-center gap-3 panel-bare px-3 py-2">
      <span className="eyebrow text-[10px] shrink-0 w-24">{label}</span>
      <span className="flex items-center gap-1.5 flex-1 min-w-[180px]">
        <span
          className="h-2 w-2 rounded-sm shrink-0"
          style={{ background: slot?.home_team?.color ?? "#3a4150" }}
        />
        <span className="text-ink text-[13px]">
          {slot?.home_team?.name ?? "TBD"}
        </span>
        <span className="text-ink-faint text-[11px]">vs</span>
        <span
          className="h-2 w-2 rounded-sm shrink-0"
          style={{ background: slot?.away_team?.color ?? "#3a4150" }}
        />
        <span className="text-ink text-[13px]">
          {slot?.away_team?.name ?? "TBD"}
        </span>
      </span>
      {isFinal ? (
        <span className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-ink text-[13px]">
            {slot?.home_score}–{slot?.away_score}
          </span>
          <span className="chip chip-final text-[10px] px-1.5 py-0.5">FINAL</span>
        </span>
      ) : slot ? (
        <span className="eyebrow text-ink-faint shrink-0">Scheduled</span>
      ) : (
        <span className="eyebrow text-ink-faint shrink-0">—</span>
      )}
    </div>
  );
}
