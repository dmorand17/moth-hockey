import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { COMMON_GAME_TIMES } from "@/lib/schedule-config";
import { weekdayLabel, type WeekdayIdx } from "@/lib/season-schedule";
import { TimeSlotsField } from "./TimeSlotsField";
import { ResetSeasonButton } from "./ResetSeasonButton";
import { SeasonIdentityFields } from "./SeasonIdentityFields";
import {
  activateSeason,
  createSeason,
  deleteSeason,
  generatePlayoffs,
  generateSchedule,
  resetSeason,
  updateSeasonDates,
  updateStandingsRules,
} from "./actions";
import { StandingsRulesEditor } from "./StandingsRulesEditor";

type SearchParams = Promise<{ saved?: string; error?: string; n?: string }>;

const inputCls =
  "bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice w-full";
const primaryBtn =
  "min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Check all required fields.",
  need_end: "Set an end date or a number of weeks.",
  not_enough_teams: "Need at least 2 teams in this season to generate a schedule.",
  cannot_delete_current: "Cannot delete the current season. Activate another first.",
  has_games: "Delete or move games before deleting the season.",
  regular_incomplete: "Finish all regular-season games before generating playoffs.",
  playoffs_need_four: "Need at least 4 teams with standings to seed playoffs.",
};

const WEEKDAYS: WeekdayIdx[] = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type SeasonRow = {
  id: string;
  season_type: "spring" | "summer" | "fall" | "winter";
  year: number;
  name: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  period_length_minutes: number;
  point_system: string;
  tiebreakers: string[];
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
      "id, season_type, year, name, start_date, end_date, is_current, period_length_minutes, point_system, tiebreakers",
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
  type GameAgg = AggRow & { final: number };
  const gameCounts = new Map<string, GameAgg>();
  for (const g of gameRows ?? []) {
    const cur = gameCounts.get(g.season_id) ?? {
      season_id: g.season_id,
      n: 0,
      final: 0,
    };
    cur.n += 1;
    if (g.status === "final") {
      cur.final += 1;
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
      : params.saved === "playoffs"
          ? "Playoffs generated / advanced."
          : params.saved === "reset"
          ? "Season reset — all games and results cleared."
          : params.saved === "dates"
            ? "Dates updated."
            : params.saved === "rules"
              ? "Standings rules updated."
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

  const currentYear = new Date().getFullYear();

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
      <section>
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none select-none min-h-9">
            <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
              ▶
            </span>
            <h2 className="font-display text-xl tracking-[0.04em] text-ink">
              NEW SEASON
            </h2>
          </summary>

          <form action={createSeason} className="panel p-4 sm:p-5 space-y-5 mt-3">
          <FieldGroup
            label="Identity"
            hint="Name auto-fills from type + year until you edit it."
          >
            <SeasonIdentityFields currentYear={currentYear} />
          </FieldGroup>

          <FieldGroup
            label="Duration"
            hint="Set an end date, or a number of weeks (weeks sets the end from the start). One is required."
          >
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
                <span className="eyebrow">End date</span>
                <input type="date" name="end_date" className={`mt-1 ${inputCls}`} />
              </label>
              <label className="block w-full sm:w-auto sm:min-w-[100px]">
                <span className="eyebrow">Weeks</span>
                <input
                  type="number"
                  name="weeks"
                  min={1}
                  max={52}
                  placeholder="10"
                  className={`mt-1 ${inputCls}`}
                />
              </label>
              <label className="block w-full sm:w-auto sm:min-w-[130px]">
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
          </FieldGroup>

          <FieldGroup label="Scoring">
            <fieldset className="space-y-1.5">
              <legend className="eyebrow text-ink-dim mb-1">Point system</legend>
              <label className="flex items-start gap-2 text-[13px] text-ink">
                <input
                  type="radio"
                  name="point_system"
                  value="3-2-1"
                  defaultChecked
                  className="mt-0.5 size-4 accent-ice"
                />
                <span>
                  <strong>3-2-1</strong>
                  <span className="text-ink-faint"> — reg win 3 · OT win 2 · OT loss 1</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-[13px] text-ink">
                <input
                  type="radio"
                  name="point_system"
                  value="2-1-0"
                  className="mt-0.5 size-4 accent-ice"
                />
                <span>
                  <strong>2-1-0</strong>
                  <span className="text-ink-faint"> — win 2 · OT loss 1</span>
                </span>
              </label>
            </fieldset>
          </FieldGroup>

          <FieldGroup
            label="Teams"
            hint="Carryover copies team rows (name, color, slug) only — rosters and captains are reassigned each season. New seasons start inactive; activate from the list below."
          >
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
          </FieldGroup>

          <button type="submit" className={primaryBtn}>
            CREATE SEASON
          </button>
          </form>
        </details>
      </section>

      {/* Season list */}
      <section className="space-y-2">
        <header className="flex items-baseline justify-between">
          <h2 className="font-display text-xl tracking-[0.04em] text-ink">
            SEASONS
          </h2>
          <span className="eyebrow">{seasons.length} total</span>
        </header>

        {seasons.length === 0 ? (
          <p className="text-ink-dim text-sm panel-bare p-4">No seasons yet.</p>
        ) : (
          <div className="space-y-2">
            {seasons.map((season) => {
              const teamCount = teamCounts.get(season.id) ?? 0;
              const gameAgg = gameCounts.get(season.id);
              const gameTotal = gameAgg?.n ?? 0;
              const finalCount = gameAgg?.final ?? 0;
              const canDelete = !season.is_current && gameTotal === 0;
              const bracket = bracketBySeason.get(season.id) ?? [];
              const sf1 = bracket.find((b) => b.playoff_round === "sf1") ?? null;
              const sf2 = bracket.find((b) => b.playoff_round === "sf2") ?? null;
              const finalSlot =
                bracket.find((b) => b.playoff_round === "final") ?? null;
              const hasPlayoffStubs = bracket.length > 0;

              return (
                <details
                  key={season.id}
                  className={`group rounded-lg border ${season.is_current ? "border-ice/40" : "border-rule"} bg-board-2/40 overflow-hidden`}
                >
                  <summary className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer list-none select-none hover:bg-board-3 transition-colors">
                    <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
                      ▶
                    </span>
                    <span className="font-display text-[15px] tracking-[0.04em] text-ink flex-1 min-w-[160px]">
                      {season.name.toUpperCase()}
                    </span>
                    {season.is_current && (
                      <span className="chip chip-live text-[10px] px-1.5 py-0.5 shrink-0">
                        CURRENT
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-ink-faint shrink-0">
                      {teamCount} teams · {gameTotal} games
                    </span>
                  </summary>

                  <div className="border-t border-rule px-4 py-4 sm:px-5 sm:py-5 space-y-6">
                    {/* Overview */}
                    <div className="flex flex-wrap gap-2">
                      <StatTile
                        label="Type"
                        value={`${cap(season.season_type)} · ${season.year}`}
                      />
                      <StatTile label="Start" value={season.start_date} />
                      <StatTile label="End" value={season.end_date ?? "—"} />
                      <StatTile
                        label="Period"
                        value={`${season.period_length_minutes} min`}
                      />
                      <StatTile label="Teams" value={teamCount} />
                      <StatTile
                        label="Games"
                        value={`${finalCount}/${gameTotal} final`}
                      />
                    </div>

                    {/* Activate — the primary action for an inactive season */}
                    {!season.is_current && (
                      <form
                        action={activateSeason}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 panel-bare rounded-lg p-3"
                      >
                        <input type="hidden" name="id" value={season.id} />
                        <button type="submit" className={primaryBtn}>
                          ACTIVATE
                        </button>
                        <p className="text-ink-faint text-[12px] flex-1 min-w-[200px]">
                          Point the public site (standings, schedule, stats) at
                          this season.
                        </p>
                      </form>
                    )}

                    {/* Dates */}
                    <FieldGroup
                      label="Dates"
                      hint="Set an end date, or weeks to set it from the start. One is required. Editing dates does not move existing games — regenerate to reschedule."
                    >
                      <form
                        action={updateSeasonDates}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <input type="hidden" name="id" value={season.id} />
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
                          <span className="eyebrow">End date</span>
                          <input
                            type="date"
                            name="end_date"
                            defaultValue={season.end_date ?? ""}
                            className={`mt-1 ${inputCls}`}
                          />
                        </label>
                        <label className="block w-full sm:w-auto sm:min-w-[110px]">
                          <span className="eyebrow">Weeks</span>
                          <input
                            type="number"
                            name="weeks"
                            min={1}
                            max={52}
                            placeholder="from start"
                            className={`mt-1 ${inputCls}`}
                          />
                        </label>
                        <button type="submit" className={primaryBtn}>
                          SAVE DATES
                        </button>
                      </form>
                    </FieldGroup>

                    {/* Tie-breakers */}
                    <FieldGroup label="Tie-breakers">
                      <p className="text-ink-faint text-[12px]">Point system: <span className="font-mono text-ink-dim">{season.point_system}</span> — set at creation.</p>
                      <StandingsRulesEditor
                        action={updateStandingsRules}
                        seasonId={season.id}
                        tiebreakers={season.tiebreakers}
                      />
                    </FieldGroup>

                    {/* Playoffs */}
                    <FieldGroup label="Playoffs" accent="ice">
                      {hasPlayoffStubs && (
                        <div className="space-y-1.5 mb-3">
                          <BracketRow label="SF1 (#1 v #4)" slot={sf1} />
                          <BracketRow label="SF2 (#2 v #3)" slot={sf2} />
                          <BracketRow label="Final" slot={finalSlot} />
                        </div>
                      )}
                      <form action={generatePlayoffs} className="flex flex-wrap items-center gap-3">
                        <input type="hidden" name="season_id" value={season.id} />
                        <button type="submit" className={primaryBtn}>
                          UPDATE PLAYOFF MATCHUPS
                        </button>
                        <p className="text-ink-faint text-[11px] flex-1 min-w-[220px]">
                          Fills the bracket (#1 v #4, #2 v #3) from the current standings,
                          and advances the Final once both semifinals are decided. Create the
                          playoff dates via &ldquo;reserve playoffs&rdquo; when generating the schedule.
                        </p>
                      </form>
                    </FieldGroup>

                    {/* Generate schedule — collapsed */}
                    <Disclosure label="Generate schedule" accent="ice">
                      <form
                        action={generateSchedule}
                        className="mt-3 space-y-3 panel-bare rounded-lg p-3"
                      >
                        <input type="hidden" name="season_id" value={season.id} />

                        {gameTotal > 0 && (
                          <p className="text-goal/80 text-[12px]">
                            ⚠ This season already has {gameTotal} games. Generating
                            deletes all <em>scheduled</em> games and replaces them;
                            live and final games are kept.
                          </p>
                        )}
                        {teamCount < 2 && (
                          <p className="text-goal/80 text-[12px]">
                            Add at least 2 teams in /admin/teams before generating.
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
                          Each week fills the time slots (one night) and teams cycle
                          through a balanced round-robin, repeating as needed. With
                          playoffs reserved, SF1, SF2 &amp; Final are added as TBD-vs-TBD
                          stubs after the final week (they show on the schedule right
                          away; seed them from the Playoffs section).
                        </p>

                        <button
                          type="submit"
                          disabled={teamCount < 2}
                          className={primaryBtn}
                        >
                          GENERATE
                        </button>
                      </form>
                    </Disclosure>

                    {/* Danger zone — collapsed by default */}
                    <Disclosure label="Danger zone" accent="goal" hint="reset or delete">
                      <div className="mt-3 space-y-4 panel-bare rounded-lg p-3">
                        {gameTotal > 0 && (
                          <div>
                            <ResetSeasonButton
                              action={resetSeason}
                              seasonId={season.id}
                              seasonName={season.name}
                              gameTotal={gameTotal}
                            />
                            <p className="text-ink-faint text-[11px] mt-2">
                              Deletes all {gameTotal} games and their scores/stats.
                              Teams and rosters are kept — regenerate afterward.
                            </p>
                          </div>
                        )}

                        <form
                          action={deleteSeason}
                          className={gameTotal > 0 ? "border-t border-rule/50 pt-3" : ""}
                        >
                          <input type="hidden" name="id" value={season.id} />
                          <button
                            type="submit"
                            disabled={!canDelete}
                            className="text-goal/70 hover:text-goal font-display tracking-[0.1em] text-[12px] transition-colors disabled:opacity-30 disabled:hover:text-goal/70 disabled:cursor-not-allowed"
                            title={
                              !canDelete
                                ? "Season must be inactive and have no games"
                                : undefined
                            }
                          >
                            DELETE SEASON
                          </button>
                          <p className="text-ink-faint text-[11px] mt-2">
                            Removes the season entirely. Only allowed when inactive
                            and game-free — reset first if it has games.
                          </p>
                        </form>
                      </div>
                    </Disclosure>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** Labeled group of form fields with an optional hint below. */
function FieldGroup({
  label,
  hint,
  accent = "ink",
  children,
}: {
  label: string;
  hint?: string;
  accent?: "ink" | "ice";
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3">
        <span className={`eyebrow ${accent === "ice" ? "text-ice" : "text-ink-dim"}`}>
          {label}
        </span>
        <span className="flex-1 h-px bg-rule/60" />
      </div>
      {children}
      {hint && <p className="text-ink-faint text-[11px] leading-relaxed">{hint}</p>}
    </div>
  );
}

/** Collapsible section with an eyebrow-styled toggle. */
function Disclosure({
  label,
  hint,
  accent = "ink",
  children,
}: {
  label: string;
  hint?: string;
  accent?: "ink" | "ice" | "goal";
  children: ReactNode;
}) {
  const color =
    accent === "ice"
      ? "text-ice hover:text-ink"
      : accent === "goal"
        ? "text-ink-faint hover:text-goal"
        : "text-ink-dim hover:text-ink";
  return (
    <details className="group/d border-t border-rule/50 pt-3">
      <summary
        className={`flex items-center gap-1.5 cursor-pointer list-none select-none eyebrow min-h-9 transition-colors ${color}`}
      >
        <span className="text-[10px] transition-transform duration-150 group-open/d:rotate-90 inline-block">
          ▶
        </span>
        {label}
        {hint && (
          <span className="text-ink-faint/60 normal-case tracking-normal ml-1">
            — {hint}
          </span>
        )}
      </summary>
      {children}
    </details>
  );
}

function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="panel-bare rounded-lg px-3 py-2 min-w-[88px]">
      <div className="eyebrow text-[9px] text-ink-faint">{label}</div>
      <div className="font-mono text-[13px] text-ink mt-0.5">{value}</div>
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
    <div className="flex flex-wrap items-center gap-3 panel-bare rounded px-3 py-2">
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
