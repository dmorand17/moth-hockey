import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GameList, GameRow } from "@/components/GameRow";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason, getStandings } from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { teamAbbr } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const season = await getCurrentSeason();
  if (!season) return { title: "Team" };
  const supabase = await createSupabaseServerClient();
  const { data: team } = await supabase
    .from("teams")
    .select("name")
    .eq("season_id", season.id)
    .eq("slug", slug)
    .maybeSingle();
  const name = team?.name ?? "Team";
  return { title: name, description: `${name} roster, record and schedule for ${season.name}.` };
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

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const season = await getCurrentSeason();
  if (!season) return <NoSeason />;
  const supabase = await createSupabaseServerClient();

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, slug, color")
    .eq("season_id", season.id)
    .eq("slug", slug)
    .single();

  if (!team) notFound();

  const [{ data: roster }, { data: gamesRaw }, { data: captainRow }, standings] = await Promise.all([
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
  ]);
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
          href="/teams"
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
          <div className="panel overflow-clip">
            <table className="board-table dense">
              <caption className="sr-only">{team.name} roster</caption>
              <thead>
                <tr>
                  {showJersey && (
                    <th scope="col" className="text-left pl-4 w-14">
                      #
                    </th>
                  )}
                  <th scope="col" className={`text-left ${showJersey ? "" : "pl-4"}`}>
                    Player
                  </th>
                </tr>
              </thead>
              {[
                { label: "Forwards", rows: forwards },
                { label: "Defense", rows: defense },
                { label: "Goalies", rows: goalies },
              ].map((group) =>
                group.rows.length === 0 ? null : (
                  <RosterGroup
                    key={group.label}
                    label={group.label}
                    rows={group.rows}
                    captainPlayerId={captain?.id ?? null}
                    showJersey={showJersey}
                  />
                ),
              )}
            </table>
          </div>
        )}
        {/* TODO(data): per-player GP/G/A/PTS on the roster needs a season stats
            query for this team (stats are derived from game events today). */}
      </section>

      {/* Schedule */}
      <section className="rise delay-2">
        <SectionHeader eyebrow="On the ice" title="Schedule & results" linkHref="/schedule" linkLabel="Full schedule" />
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

function RosterGroup({
  label,
  rows,
  captainPlayerId,
  showJersey,
}: {
  label: string;
  rows: RosterRow[];
  captainPlayerId: string | null;
  showJersey: boolean;
}) {
  return (
    <tbody>
      <tr>
        <th scope="rowgroup" colSpan={showJersey ? 2 : 1} className="text-left pl-4 pt-4 pb-1 eyebrow bg-board-2">
          {label} <span className="text-ink-faint font-normal">· {rows.length}</span>
        </th>
      </tr>
      {rows.map((r) => {
        const p = r.player!;
        const isCaptain = captainPlayerId === p.id;
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
          </tr>
        );
      })}
    </tbody>
  );
}
