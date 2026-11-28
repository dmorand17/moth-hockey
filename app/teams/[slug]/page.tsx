import Link from "next/link";
import { DataTable } from "@/components/DataTable";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GameList, GameRow } from "@/components/GameRow";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSeasonFinalizeInputs, getStandings } from "@/lib/queries";
import { computeSeasonTotals, type SeasonTotals } from "@/lib/season-finalize";
import { seasonQuery } from "@/lib/seasons";
import { teamAbbr } from "@/lib/format";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ season?: string }>;
};

// Slugs repeat across seasons, so resolve the team in the requested season
// (?season=<id>), else the current season, else the most recent season that
// had a team with this slug.
async function resolveTeam(slug: string, seasonId: string | undefined) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("teams")
    .select("id, name, slug, color, season:season_id(id, name, is_current, start_date)")
    .eq("slug", slug);
  const rows = (data ?? []).filter((t) => t.season);
  const match =
    rows.find((t) => t.season!.id === seasonId) ??
    rows.find((t) => t.season!.is_current) ??
    rows.sort((a, b) => b.season!.start_date.localeCompare(a.season!.start_date))[0];
  if (!match) return null;
  const { season, ...team } = match;
  return { team, season: season! };
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ slug }, { season: seasonParam }] = await Promise.all([params, searchParams]);
  const resolved = await resolveTeam(slug, seasonParam);
  if (!resolved) return { title: "Team" };
  const { team, season } = resolved;
  return { title: team.name, description: `${team.name} roster, record and schedule for ${season.name}.` };
}

type TeamRef = { name: string; slug: string; color: string };
type TeamGame = {
  id: string;
  scheduled_at: string;
  status: "scheduled" | "live" | "final";
  kind: "regular" | "playoff";
  playoff_round: "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final" | null;
  home_score: number;
  away_score: number;
  decided_in: "regulation" | "ot" | "shootout" | null;
  home_team: TeamRef;
  away_team: TeamRef;
};

export default async function TeamPage({ params, searchParams }: PageProps) {
  const [{ slug }, { season: seasonParam }] = await Promise.all([params, searchParams]);
  const resolved = await resolveTeam(slug, seasonParam);
  if (!resolved) notFound();
  const { team, season } = resolved;
  const supabase = await createSupabaseServerClient();

  const [{ data: roster }, { data: gamesRaw }, { data: captainRow }, standings, statInputs] = await Promise.all([
    supabase
      .from("team_players")
      .select("jersey_number, position, player:player_id(id, first_name, last_name)")
      .eq("team_id", team.id)
      .order("jersey_number", { ascending: true }),
    supabase
      .from("games")
      .select(
        "id, scheduled_at, status, kind, playoff_round, home_score, away_score, decided_in, home_team:home_team_id(name, slug, color), away_team:away_team_id(name, slug, color)",
      )
      .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
      .order("scheduled_at"),
    supabase
      .from("team_captains")
      .select("user_id")
      .eq("team_id", team.id)
      .eq("season_id", season.id)
      .maybeSingle(),
    getStandings(season.id),
    seasonTotals(season.id, season.is_current),
  ]);
  const totalsByPlayer = new Map(statInputs.filter((t) => t.team_id === team.id).map((t) => [t.player_id, t]));
  const rankIdx = standings.findIndex((r) => r.team_id === team.id);
  const record = rankIdx >= 0 ? standings[rankIdx] : null;
  const games = (gamesRaw ?? []) as unknown as TeamGame[];

  // Captain shown by name only — anon RLS blocks user_profiles, so we resolve
  // through the players row that's linked to that user (publicly readable).
  let captain: { id: string; first_name: string; last_name: string } | null = null;
  if (captainRow?.user_id) {
    const { data: player } = await supabase
      .from("players")
      .select("id, first_name, last_name")
      .eq("user_id", captainRow.user_id)
      .maybeSingle();
    if (player) captain = player;
  }

  const forwards = (roster ?? []).filter((r) => r.position === "forward");
  const defense = (roster ?? []).filter((r) => r.position === "defense");
  const goalies = (roster ?? []).filter((r) => r.position === "goalie");
  // Hide the jersey column entirely when no numbers are on file.
  const showJersey = (roster ?? []).some((r) => r.jersey_number != null);

  return (
    <div className="space-y-8 md:space-y-12">
      {/* Header */}
      <section className="rise">
        <Link
          href={`/teams${seasonQuery(season)}`}
          className="text-[14px] font-semibold text-ice hover:text-ink transition-colors inline-flex items-center min-h-11"
        >
          <span aria-hidden className="mr-1">←</span> All teams
        </Link>
        <div className="mt-2 panel overflow-clip flex">
          <span aria-hidden className="swatch w-1 shrink-0" style={{ background: team.color }} />
          <div className="flex-1 p-4 md:p-6 flex flex-wrap items-center gap-4">
            <span
              aria-hidden
              className="swatch h-14 w-14 md:h-16 md:w-16 shrink-0 rounded-md flex items-center justify-center font-display text-[26px] md:text-[30px] text-board"
              style={{ background: team.color }}
            >
              {teamAbbr(team.name).slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">{season.name}</p>
              <h1 className="font-display text-[40px] leading-[44px] md:text-[56px] md:leading-[64px] tracking-[0.02em]">
                {team.name}
              </h1>
              {captain && (
                <p className="text-[14px] text-ink-faint">
                  Captain{" "}
                  <Link href={`/players/${captain.id}`} className="text-ink-dim hover:text-ice transition-colors">
                    {captain.first_name} {captain.last_name}
                  </Link>
                </p>
              )}
            </div>
            {record && (
              <dl className="basis-full sm:basis-auto flex gap-6 sm:text-right border-t border-rule pt-3 sm:border-0 sm:pt-0">
                <div>
                  <dt className="eyebrow">Record</dt>
                  <dd className="digit text-[22px] text-ink">
                    {record.w}-{record.l}-{record.otl}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">PTS</dt>
                  <dd className="digit text-[22px] text-ink">{record.pts}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Rank</dt>
                  <dd className={`digit text-[22px] ${rankIdx === 0 ? "text-gold" : "text-ink"}`}>#{rankIdx + 1}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>
      </section>

      {/* Roster */}
      <section className="rise delay-1">
        <SectionHeader eyebrow="Roster" title="The lineup" />
        {(roster ?? []).length === 0 ? (
          <EmptyState title="No roster set for this season yet." />
        ) : (
          <div className="space-y-4">
            {forwards.length + defense.length > 0 && (
              <DataTable caption={`${team.name} skaters`}>
                <RosterHead label="Skater" cols={SKATER_COLS} showJersey={showJersey} />
                {[
                  { label: "Forwards", rows: forwards },
                  { label: "Defense", rows: defense },
                ].map((group) =>
                  group.rows.length === 0 ? null : (
                    <RosterGroup
                      key={group.label}
                      label={group.label}
                      rows={group.rows}
                      cols={SKATER_COLS}
                      totalsByPlayer={totalsByPlayer}
                      captainPlayerId={captain?.id ?? null}
                      showJersey={showJersey}
                    />
                  ),
                )}
              </DataTable>
            )}
            {goalies.length > 0 && (
              <DataTable caption={`${team.name} goalies`}>
                <RosterHead label="Goalie" cols={GOALIE_COLS} showJersey={showJersey} />
                <RosterGroup
                  label="Goalies"
                  rows={goalies}
                  cols={GOALIE_COLS}
                  totalsByPlayer={totalsByPlayer}
                  captainPlayerId={captain?.id ?? null}
                  showJersey={showJersey}
                />
              </DataTable>
            )}
          </div>
        )}
      </section>

      {/* Schedule */}
      <section className="rise delay-2">
        <SectionHeader eyebrow="On the ice" title="Schedule & results" linkHref={`/schedule${seasonQuery(season)}`} linkLabel="Full schedule" />
        {games.length === 0 ? (
          <EmptyState compact title="No games scheduled yet." />
        ) : (
          <GameList>
            {games.map((g) => (
              <GameRow
                key={g.id}
                id={g.id}
                scheduled_at={g.scheduled_at}
                status={g.status}
                home_team={g.home_team}
                away_team={g.away_team}
                home_score={g.home_score}
                away_score={g.away_score}
                decided_in={g.decided_in}
                kind={g.kind}
                playoff_round={g.playoff_round}
                showDate
              />
            ))}
          </GameList>
        )}
      </section>
    </div>
  );
}

type RosterRow = {
  jersey_number: number | null;
  position: "forward" | "defense" | "goalie";
  player: { id: string; first_name: string; last_name: string } | null;
};

// Regular-season player totals, same rules as the Stats page: derived from game
// events for the current season, pre-aggregated rows for past seasons.
async function seasonTotals(seasonId: string, isCurrent: boolean): Promise<SeasonTotals[]> {
  if (isCurrent) {
    const i = await getSeasonFinalizeInputs(seasonId);
    return computeSeasonTotals(i.games, i.roster, i.appearances, i.events);
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("season_player_stats")
    .select(
      "player_id, team_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made, goals_against, penalty_shots_faced, penalty_shots_saved, wins, losses, ot_losses",
    )
    .eq("season_id", seasonId);
  return (data ?? []) as SeasonTotals[];
}

type StatCol = { label: string; title: string; value: (t: SeasonTotals | undefined) => string | number };

const SKATER_COLS: StatCol[] = [
  { label: "GP", title: "Games played", value: (t) => t?.games_played ?? 0 },
  { label: "G", title: "Goals", value: (t) => t?.goals ?? 0 },
  { label: "A", title: "Assists", value: (t) => t?.assists ?? 0 },
  { label: "PTS", title: "Points", value: (t) => (t ? t.goals + t.assists : 0) },
  { label: "PEN", title: "Penalties committed", value: (t) => t?.penalties ?? 0 },
];

const GOALIE_COLS: StatCol[] = [
  { label: "GP", title: "Games played", value: (t) => t?.games_played ?? 0 },
  { label: "GA", title: "Goals against", value: (t) => t?.goals_against ?? 0 },
  {
    label: "GAA",
    title: "Goals-against average",
    value: (t) => (t && t.games_played > 0 ? ((t.goals_against ?? 0) / t.games_played).toFixed(2) : "—"),
  },
  {
    label: "W-L-OT",
    title: "Wins, losses, overtime/shootout losses",
    value: (t) => `${t?.wins ?? 0}-${t?.losses ?? 0}-${t?.ot_losses ?? 0}`,
  },
];

function RosterHead({ label, cols, showJersey }: { label: string; cols: StatCol[]; showJersey: boolean }) {
  return (
    <thead>
      <tr>
        {showJersey && (
          <th scope="col" className="text-left pl-4 w-10">
            #
          </th>
        )}
        <th scope="col" className={`text-left ${showJersey ? "" : "pl-4"}`}>
          {label}
        </th>
        {cols.map((c, i) => (
          <th
            key={c.label}
            scope="col"
            title={c.title}
            className={`text-right ${i === cols.length - 1 ? "pr-4" : ""}`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function RosterGroup({
  label,
  rows,
  cols,
  totalsByPlayer,
  captainPlayerId,
  showJersey,
}: {
  label: string;
  rows: RosterRow[];
  cols: StatCol[];
  totalsByPlayer: Map<string, SeasonTotals>;
  captainPlayerId: string | null;
  showJersey: boolean;
}) {
  return (
    <tbody>
      <tr>
        <th
          scope="rowgroup"
          colSpan={(showJersey ? 2 : 1) + cols.length}
          className="text-left pl-4 pt-4 pb-1 eyebrow bg-board-2"
        >
          {label} <span className="text-ink-faint font-normal">· {rows.length}</span>
        </th>
      </tr>
      {rows.map((r) => {
        const p = r.player!;
        const isCaptain = captainPlayerId === p.id;
        const totals = totalsByPlayer.get(p.id);
        return (
          <tr key={p.id}>
            {showJersey && <td className="pl-4 tnum text-ink-faint">{r.jersey_number ?? "—"}</td>}
            <td className={showJersey ? "" : "pl-4"}>
              <Link
                href={`/players/${p.id}`}
                className="flex items-center gap-2 min-h-[44px] text-ink hover:text-ice transition-colors"
              >
                <span>
                  {p.first_name} {p.last_name}
                </span>
                {isCaptain && (
                  <span title="Captain" className="chip text-ink!">
                    <span aria-hidden>C</span>
                    <span className="sr-only">Captain</span>
                  </span>
                )}
              </Link>
            </td>
            {cols.map((c, i) => (
              <td
                key={c.label}
                className={`text-right tnum ${c.label === "PTS" ? "font-semibold text-ink" : "text-ink-dim"} ${
                  i === cols.length - 1 ? "pr-4" : ""
                }`}
              >
                {c.value(totals)}
              </td>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
}
