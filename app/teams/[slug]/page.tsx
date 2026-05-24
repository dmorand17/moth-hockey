import Link from "next/link";
import { notFound } from "next/navigation";
import { GameRow } from "@/components/GameRow";
import { SectionHeader } from "@/components/SectionHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";

type TeamRef = { name: string; slug: string; color: string };
type TeamGame = {
  id: string;
  scheduled_at: string;
  status: "scheduled" | "live" | "final";
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
  const supabase = await createSupabaseServerClient();

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, slug, color")
    .eq("season_id", season.id)
    .eq("slug", slug)
    .single();

  if (!team) notFound();

  const [{ data: roster }, { data: gamesRaw }] = await Promise.all([
    supabase
      .from("team_players")
      .select("jersey_number, position, player:player_id(id, first_name, last_name)")
      .eq("team_id", team.id)
      .order("jersey_number", { ascending: true }),
    supabase
      .from("games")
      .select(
        "id, scheduled_at, status, home_score, away_score, decided_in, home_team:home_team_id(name, slug, color), away_team:away_team_id(name, slug, color)",
      )
      .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
      .order("scheduled_at"),
  ]);
  const games = (gamesRaw ?? []) as unknown as TeamGame[];

  const forwards = (roster ?? []).filter((r) => r.position === "forward");
  const defense = (roster ?? []).filter((r) => r.position === "defense");
  const goalies = (roster ?? []).filter((r) => r.position === "goalie");

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Hero */}
      <section
        className="rise panel p-4 sm:p-6 md:p-8 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${team.color}18 0%, transparent 60%), var(--board-2)`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ background: team.color, boxShadow: `0 0 30px ${team.color}99` }}
        />
        <Link href="/teams" className="eyebrow hover:text-ink transition-colors">
          ← All teams
        </Link>
        <div className="mt-3 sm:mt-4 flex items-center gap-3 sm:gap-5">
          <div className="relative h-14 w-14 sm:h-20 sm:w-20 shrink-0">
            <div
              className="absolute inset-0 rounded-sm"
              style={{ background: team.color }}
            />
            <div className="absolute inset-0 flex items-center justify-center font-display text-board text-[24px] sm:text-[34px] tracking-tight">
              {team.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
          </div>
          <div>
            <div className="eyebrow">{season.name}</div>
            <h1 className="font-display text-[32px] sm:text-[44px] md:text-[68px] leading-[0.92] tracking-[0.04em] mt-1">
              {team.name.toUpperCase()}
            </h1>
          </div>
        </div>
      </section>

      {/* Roster */}
      <section className="rise delay-1">
        <SectionHeader eyebrow="Roster" title="The Lineup" />
        <div className="grid gap-3 sm:gap-6 md:grid-cols-[1fr_auto] md:gap-8">
          <div className="panel overflow-hidden">
            <table className="board-table">
              <thead>
                <tr>
                  <th className="text-left pl-5 w-14">#</th>
                  <th className="text-left">Player</th>
                  <th className="text-right pr-5">Pos</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Forwards", rows: forwards },
                  { label: "Defense", rows: defense },
                  { label: "Goalies", rows: goalies },
                ].map((group) =>
                  group.rows.length === 0 ? null : (
                    <RosterGroup key={group.label} label={group.label} rows={group.rows} />
                  ),
                )}
              </tbody>
            </table>
          </div>
          <div className="panel-bare p-5 md:w-56 self-start">
            <div className="eyebrow mb-3 text-goal">By position</div>
            <div className="space-y-2 text-[14px]">
              <RosterStat label="Forwards" value={forwards.length} />
              <RosterStat label="Defense" value={defense.length} />
              <RosterStat label="Goalies" value={goalies.length} />
              <div className="pt-2 mt-2 border-t border-rule">
                <RosterStat label="Total" value={forwards.length + defense.length + goalies.length} accent="text-ink" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Schedule */}
      <section className="rise delay-2">
        <SectionHeader eyebrow="On The Ice" title="Schedule & Results" />
        <div className="grid gap-3 sm:grid-cols-2">
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
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function RosterStat({ label, value, accent = "text-ink-dim" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="eyebrow normal-case tracking-[0.06em]">{label}</span>
      <span className={`digit text-lg ${accent}`}>{value}</span>
    </div>
  );
}

type RosterRow = {
  jersey_number: number | null;
  position: "forward" | "defense" | "goalie";
  player: { id: string; first_name: string; last_name: string } | null;
};

function RosterGroup({ label, rows }: { label: string; rows: RosterRow[] }) {
  return (
    <>
      <tr>
        <td colSpan={3} className="pl-5 pt-5 pb-2">
          <div className="eyebrow text-goal">{label}</div>
        </td>
      </tr>
      {rows.map((r) => {
        const p = r.player!;
        return (
          <tr key={p.id}>
            <td className="pl-5 digit text-ink-faint text-[15px]">
              {r.jersey_number ?? "—"}
            </td>
            <td className="!p-0">
              <Link
                href={`/players/${p.id}`}
                className="flex items-center min-h-[44px] px-2 -mx-2 hover:text-ink transition-colors"
              >
                {p.first_name} <span className="font-medium">&nbsp;{p.last_name}</span>
              </Link>
            </td>
            <td className="text-right pr-5 eyebrow">{r.position}</td>
          </tr>
        );
      })}
    </>
  );
}
