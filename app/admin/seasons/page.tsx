import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { COMMON_GAME_TIMES } from "@/lib/schedule-config";
import { weekdayLabel, playoffLabel, playoffRoundsFor, type WeekdayIdx, type PlayoffRound } from "@/lib/season-schedule";
import { TimeSlotsField } from "./TimeSlotsField";
import { ResetSeasonButton } from "./ResetSeasonButton";
import { SeasonIdentityFields } from "./SeasonIdentityFields";
import { SeasonDurationFields } from "./SeasonDurationFields";
import {
  activateSeason,
  assignTeamCaptain,
  copyTeamsInto,
  createSeason,
  createTeam,
  deleteSeason,
  generatePlayoffs,
  generateSchedule,
  resetSeason,
  updateSeasonDates,
  updateStandingsRules,
  updateTeam,
} from "./actions";
import { ColorSwatches } from "./color-swatches";
import { RosterEditor } from "./RosterEditor";
import { StandingsRulesEditor } from "./StandingsRulesEditor";
import { PlayerCombobox } from "@/components/PlayerCombobox";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";

const inputCls =
  "bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice w-full";
const primaryBtn =
  "min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

const WEEKDAYS: WeekdayIdx[] = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Whole weeks between a season's start and end (end = start + weeks×7), for
// pre-filling the weeks field and the overview. Empty string when indeterminate.
function weeksBetween(startDate: string, endDate: string | null): string {
  if (!startDate || !endDate) return "";
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const weeks = Math.round((end.getTime() - start.getTime()) / (7 * 86400000));
  return weeks > 0 ? String(weeks) : "";
}

type SeasonRow = {
  id: string;
  season_type: "spring" | "summer" | "fall" | "winter";
  year: number;
  name: string;
  start_date: string;
  end_date: string | null;
  regular_weeks: number | null;
  is_current: boolean;
  period_length_minutes: number;
  point_system: string;
  tiebreakers: string[];
};

type AggRow = { season_id: string; n: number };

export default async function AdminSeasonsPage() {
  await requireRole(["admin"]);

  const supabase = await createSupabaseServerClient();
  const { data: seasonsRaw } = await supabase
    .from("seasons")
    .select(
      "id, season_type, year, name, start_date, end_date, regular_weeks, is_current, period_length_minutes, point_system, tiebreakers",
    )
    .order("start_date", { ascending: false });

  const seasons = (seasonsRaw ?? []) as SeasonRow[];

  // Aggregate counts per season for the summary chips + playoff bracket details.
  const [{ data: teamRows }, { data: gameRows }, { data: playoffRows }, { data: rosterRows }, { data: allPlayers }] =
    await Promise.all([
      supabase.from("teams").select("id, name, slug, color, season_id").order("name"),
      supabase.from("games").select("season_id, status, kind"),
      supabase
        .from("games")
        .select(
          "season_id, playoff_round, status, home_score, away_score, home_team:home_team_id(name, color), away_team:away_team_id(name, color)",
        )
        .eq("kind", "playoff")
        .order("playoff_round"),
      supabase
        .from("team_players")
        .select(
          "team_id, season_id, player_id, position, jersey_number, is_captain, player:player_id(id, first_name, last_name)",
        ),
      supabase.from("players").select("id, first_name, last_name").order("last_name").order("first_name"),
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
    playoff_round: "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final" | null;
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

  type RosterPlayer = {
    player_id: string;
    first_name: string;
    last_name: string;
    position: string;
    jersey_number: number | null;
    is_captain: boolean;
  };
  const teamsBySeason = new Map<string, { id: string; name: string; slug: string; color: string }[]>();
  for (const t of teamRows ?? []) {
    const arr = teamsBySeason.get(t.season_id) ?? [];
    arr.push({ id: t.id, name: t.name, slug: t.slug, color: t.color });
    teamsBySeason.set(t.season_id, arr);
  }
  const rosterByTeam = new Map<string, RosterPlayer[]>();
  const rosteredBySeason = new Map<string, Set<string>>();
  const captainByTeam = new Map<string, string>();
  for (const r of rosterRows ?? []) {
    const p = r.player as { id: string; first_name: string; last_name: string } | null;
    if (!p) continue;
    (rosterByTeam.get(r.team_id) ?? rosterByTeam.set(r.team_id, []).get(r.team_id)!).push({
      player_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      position: r.position,
      jersey_number: r.jersey_number,
      is_captain: r.is_captain,
    });
    const set = rosteredBySeason.get(r.season_id) ?? new Set<string>();
    set.add(p.id);
    rosteredBySeason.set(r.season_id, set);
    if (r.is_captain) captainByTeam.set(r.team_id, p.id);
  }
  for (const players of rosterByTeam.values()) {
    players.sort((a, b) => {
      if (a.jersey_number != null && b.jersey_number != null) return a.jersey_number - b.jersey_number;
      if (a.jersey_number != null) return -1;
      if (b.jersey_number != null) return 1;
      return a.last_name.localeCompare(b.last_name);
    });
  }

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-8">
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

          <ActionForm action={createSeason} resetOnSuccess className="panel p-4 sm:p-5 space-y-5 mt-3">
          <FieldGroup
            label="Identity"
            hint="Name auto-fills from type + year until you edit it."
          >
            <SeasonIdentityFields currentYear={currentYear} />
          </FieldGroup>

          <FieldGroup
            label="Duration"
            hint="Set the regular season length in weeks — the end date is calculated from the start."
          >
            <div className="flex flex-wrap items-end gap-3">
              <SeasonDurationFields />
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

          <p className="text-ink-faint text-[12px]">
            New seasons start inactive and use the <strong>3-2-1</strong> point
            system. Set the point system, tie-breakers, and teams after creating
            it — expand the season below.
          </p>

          <SubmitButton className={primaryBtn}>
            CREATE SEASON
          </SubmitButton>
          </ActionForm>
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
              const canDelete = !season.is_current && gameTotal === 0;
              const bracket = bracketBySeason.get(season.id) ?? [];
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
                        label="Weeks"
                        value={
                          season.regular_weeks ??
                          (weeksBetween(season.start_date, season.end_date) || "—")
                        }
                      />
                      <StatTile
                        label="Period"
                        value={`${season.period_length_minutes} min`}
                      />
                      <StatTile label="Teams" value={teamCount} />
                    </div>

                    {/* Activate — the primary action for an inactive season */}
                    {!season.is_current && (
                      <ActionForm
                        action={activateSeason}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 panel-bare rounded-lg p-3"
                      >
                        <input type="hidden" name="id" value={season.id} />
                        <SubmitButton className={primaryBtn}>
                          ACTIVATE
                        </SubmitButton>
                        <p className="text-ink-faint text-[12px] flex-1 min-w-[200px]">
                          Point the public site (standings, schedule, stats) at
                          this season.
                        </p>
                      </ActionForm>
                    )}

                    {/* Dates — collapsed */}
                    <Disclosure label="Dates" hint="start & weeks">
                      <p className="text-ink-faint text-[11px] mt-2 mb-2">
                        Set the regular season weeks — the end date is calculated
                        from the start. Editing dates doesn&apos;t move existing
                        games — regenerate to reschedule.
                      </p>
                      <ActionForm
                        action={updateSeasonDates}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <input type="hidden" name="id" value={season.id} />
                        <SeasonDurationFields
                          defaultStartDate={season.start_date}
                          defaultWeeks={
                            season.regular_weeks != null
                              ? String(season.regular_weeks)
                              : weeksBetween(season.start_date, season.end_date)
                          }
                        />
                        <SubmitButton className={primaryBtn}>
                          SAVE DATES
                        </SubmitButton>
                      </ActionForm>
                    </Disclosure>

                    {/* Standings rules — collapsed */}
                    <Disclosure label="Standings rules" hint="points & tie-breakers">
                      <p className="text-ink-faint text-[11px] mt-2 mb-2">
                        Changing these recomputes this season&apos;s standings and
                        playoff seeding.
                      </p>
                      <StandingsRulesEditor
                        action={updateStandingsRules}
                        seasonId={season.id}
                        pointSystem={season.point_system}
                        tiebreakers={season.tiebreakers}
                      />
                    </Disclosure>

                    {/* Teams — collapsed */}
                    <Disclosure label="Teams" hint="rosters & captains">
                      {/* Add-team form */}
                      <ActionForm action={createTeam} resetOnSuccess className="panel p-3 space-y-3">
                        <input type="hidden" name="season_id" value={season.id} />
                        <div className="flex items-end gap-3">
                          <label className="block flex-1">
                            <span className="eyebrow">Name</span>
                            <input
                              type="text"
                              name="name"
                              required
                              placeholder="Ice Holes"
                              className={`mt-1 ${inputCls}`}
                            />
                          </label>
                          <SubmitButton className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors shrink-0">
                            ADD TEAM
                          </SubmitButton>
                        </div>
                        <div>
                          <span className="eyebrow">Color</span>
                          <ColorSwatches
                            name="color"
                            defaultValue="#ef4444"
                            idPrefix={`new-team-${season.id}`}
                          />
                        </div>
                      </ActionForm>

                      {/* Copy teams from another season — rarely used, collapsed */}
                      {seasons.length > 1 && (
                        <details className="group/ct">
                          <summary className="flex items-center gap-1.5 cursor-pointer list-none select-none eyebrow text-ink-faint hover:text-ink transition-colors min-h-9">
                            <span className="text-[10px] transition-transform duration-150 group-open/ct:rotate-90 inline-block">
                              ▶
                            </span>
                            Copy teams from another season
                          </summary>
                          <ActionForm
                            action={copyTeamsInto}
                            className="mt-2 flex flex-wrap items-end gap-3 panel-bare rounded p-3"
                          >
                            <input type="hidden" name="season_id" value={season.id} />
                            <label className="block flex-1 min-w-[180px]">
                              <span className="eyebrow">Source season</span>
                              <select
                                name="source_season_id"
                                required
                                defaultValue=""
                                className={`mt-1 ${inputCls}`}
                              >
                                <option value="" disabled>
                                  — select season —
                                </option>
                                {seasons
                                  .filter((s) => s.id !== season.id)
                                  .map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <SubmitButton className={primaryBtn}>
                              COPY TEAMS
                            </SubmitButton>
                            <p className="text-ink-faint text-[11px] w-full">
                              Copies team names/colors only — rosters &amp;
                              captains stay per-season.
                            </p>
                          </ActionForm>
                        </details>
                      )}

                      {/* Team list */}
                      {(teamsBySeason.get(season.id) ?? []).length === 0 ? (
                        <p className="text-ink-dim text-[12px]">
                          No teams yet — add one above.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {(teamsBySeason.get(season.id) ?? []).map((team) => {
                            const teamPlayers = rosterByTeam.get(team.id) ?? [];
                            const unrosteredForSeason = (allPlayers ?? []).filter(
                              (p) => !(rosteredBySeason.get(season.id)?.has(p.id)),
                            );
                            return (
                              <details
                                key={team.id}
                                className="group/t border border-rule rounded"
                              >
                                <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none select-none hover:bg-board-3 transition-colors rounded">
                                  <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open/t:rotate-90 inline-block">
                                    ▶
                                  </span>
                                  <span
                                    className="h-3 w-3 rounded-sm shrink-0"
                                    style={{ background: team.color }}
                                  />
                                  <span className="font-display text-[14px] tracking-[0.04em] text-ink">
                                    {team.name.toUpperCase()}
                                  </span>
                                  <span className="font-mono text-[11px] text-ink-faint">
                                    /{team.slug}
                                  </span>
                                  <span className="eyebrow text-ink-faint ml-auto">
                                    {teamPlayers.length} players
                                  </span>
                                </summary>

                                <div className="border-t border-rule p-4 space-y-4">
                                  {/* Name / Color */}
                                  <ActionForm action={updateTeam} className="space-y-3">
                                    <input type="hidden" name="id" value={team.id} />
                                    <div className="flex items-end gap-3">
                                      <label className="block flex-1">
                                        <span className="eyebrow">Name</span>
                                        <input
                                          type="text"
                                          name="name"
                                          required
                                          defaultValue={team.name}
                                          className={`mt-1 ${inputCls}`}
                                        />
                                      </label>
                                      <SubmitButton className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors shrink-0">
                                        SAVE
                                      </SubmitButton>
                                    </div>
                                    <div>
                                      <span className="eyebrow">Color</span>
                                      <ColorSwatches
                                        name="color"
                                        defaultValue={team.color}
                                        idPrefix={`team-${team.id}`}
                                      />
                                    </div>
                                  </ActionForm>

                                  {/* Captain */}
                                  <div className="border-t border-rule/50 pt-3">
                                    <ActionForm
                                      action={assignTeamCaptain}
                                      className="flex items-center gap-2"
                                    >
                                      <input
                                        type="hidden"
                                        name="team_id"
                                        value={team.id}
                                      />
                                      <input
                                        type="hidden"
                                        name="season_id"
                                        value={season.id}
                                      />
                                      <span className="eyebrow shrink-0">Captain</span>
                                      <div className="flex-1">
                                        <PlayerCombobox
                                          name="player_id"
                                          defaultValue={captainByTeam.get(team.id) ?? ""}
                                          disabled={teamPlayers.length === 0}
                                          allowClear
                                          placeholder={
                                            teamPlayers.length === 0
                                              ? "No players yet"
                                              : "— No captain —"
                                          }
                                          options={teamPlayers.map((p) => ({
                                            value: p.player_id,
                                            label: `${p.last_name}, ${p.first_name}`,
                                          }))}
                                        />
                                      </div>
                                      <SubmitButton
                                        disabled={teamPlayers.length === 0}
                                        className="px-2.5 py-1 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.1em] text-[11px] rounded transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        SAVE
                                      </SubmitButton>
                                    </ActionForm>
                                    {teamPlayers.length === 0 && (
                                      <p className="text-ink-faint text-[11px] mt-1.5">
                                        Add players to the roster to pick a captain.
                                      </p>
                                    )}
                                  </div>

                                  {/* Roster */}
                                  <div className="border-t border-rule/50 pt-3">
                                    <RosterEditor
                                      teamId={team.id}
                                      initialRows={teamPlayers}
                                      unrosteredAll={unrosteredForSeason}
                                    />
                                  </div>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      )}
                    </Disclosure>

                    {/* Playoffs */}
                    <Disclosure label="Playoffs" accent="ice">
                      {hasPlayoffStubs && (
                        <div className="space-y-1.5 mb-3">
                          {bracket
                            .filter(
                              (g): g is BracketSlot & { playoff_round: PlayoffRound } =>
                                g.playoff_round !== null,
                            )
                            .sort(
                              (a, b) =>
                                playoffRoundsFor(3).indexOf(a.playoff_round) -
                                playoffRoundsFor(3).indexOf(b.playoff_round),
                            )
                            .map((g) => (
                              <BracketRow
                                key={g.playoff_round}
                                label={playoffLabel(g.playoff_round)}
                                slot={g}
                              />
                            ))}
                        </div>
                      )}
                      <ActionForm action={generatePlayoffs} className="flex flex-wrap items-center gap-3">
                        <input type="hidden" name="season_id" value={season.id} />
                        <SubmitButton className={primaryBtn}>
                          UPDATE PLAYOFF MATCHUPS
                        </SubmitButton>
                        <p className="text-ink-faint text-[11px] flex-1 min-w-[220px]">
                          Seeds each round from the current standings (top team is
                          home) and advances winners as earlier rounds finish. Create the
                          playoff dates with the &ldquo;Playoff rounds&rdquo; option when generating the schedule.
                        </p>
                      </ActionForm>
                    </Disclosure>

                    {/* Generate schedule — collapsed */}
                    <Disclosure label="Schedule Generator" accent="ice">
                      <ActionForm
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
                            Add at least 2 teams (in this season&apos;s Teams section) before generating.
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
                          <label className="block w-full sm:w-auto sm:min-w-[140px]">
                            <span className="eyebrow">Regular season weeks</span>
                            <input
                              type="number"
                              name="weeks"
                              defaultValue={season.regular_weeks ?? 10}
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

                        <label className="block w-full sm:w-auto sm:min-w-[200px]">
                          <span className="eyebrow">Playoff rounds</span>
                          <select name="playoff_rounds" defaultValue="2" className={`mt-1 ${inputCls}`}>
                            <option value="0">None</option>
                            <option value="1">Final only (top 2)</option>
                            <option value="2">Semis + Final (top 4)</option>
                            <option value="3">Quarters + Semis + Final (top 8)</option>
                          </select>
                        </label>

                        <p className="text-ink-faint text-[12px]">
                          <strong>Regular season weeks</strong> = how many game
                          nights to schedule (not counting playoffs). Each week
                          fills the time slots (one night) and teams cycle through a
                          balanced round-robin, repeating as needed. Playoffs add the
                          chosen rounds as TBD-vs-TBD stubs after the final week (they
                          show on the schedule right away; seed them from the Playoffs
                          section).
                        </p>

                        {teamCount % 2 === 1 && teamCount >= 3 && (
                          <p className="text-[12px] text-[#fbbf24]/90">
                            <strong>Byes:</strong> with {teamCount} teams, one team
                            sits out each week. For even byes, use a multiple of{" "}
                            {teamCount} regular weeks — e.g. {teamCount},{" "}
                            {teamCount * 2}, or {teamCount * 3} (1, 2, or 3 byes
                            each). Any playoff rounds you choose add their weeks on
                            top of that.
                          </p>
                        )}

                        <SubmitButton
                          disabled={teamCount < 2}
                          className={primaryBtn}
                        >
                          GENERATE
                        </SubmitButton>
                      </ActionForm>
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

                        <ActionForm
                          action={deleteSeason}
                          className={gameTotal > 0 ? "border-t border-rule/50 pt-3" : ""}
                        >
                          <input type="hidden" name="id" value={season.id} />
                          <SubmitButton
                            disabled={!canDelete}
                            className="text-goal/70 hover:text-goal font-display tracking-[0.1em] text-[12px] transition-colors disabled:opacity-30 disabled:hover:text-goal/70 disabled:cursor-not-allowed"
                            title={
                              !canDelete
                                ? "Season must be inactive and have no games"
                                : undefined
                            }
                          >
                            DELETE SEASON
                          </SubmitButton>
                          <p className="text-ink-faint text-[11px] mt-2">
                            Removes the season entirely. Only allowed when inactive
                            and game-free — reset first if it has games.
                          </p>
                        </ActionForm>
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
