import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSeasonFinalizeInputs } from "@/lib/queries";
import { computeSeasonTotals } from "@/lib/season-finalize";
import { SectionHeader } from "@/components/SectionHeader";
import { SkaterTable, GoalieTable, type Skater, type Goalie } from "@/components/StatsTables";

type Row = {
  season_id: string;
  player_id: string;
  team_id: string | null;
  position: "forward" | "defense" | "goalie";
  games_played: number;
  goals: number;
  assists: number;
  penalties: number;
  penalty_shots_taken: number;
  penalty_shots_made: number;
  goals_against: number | null;
  penalty_shots_faced: number | null;
  penalty_shots_saved: number | null;
  wins: number | null;
  losses: number | null;
  ot_losses: number | null;
};

const SPINE_CLS = "border-l-[3px] pl-4 sm:pl-6 py-4 sm:py-5 rounded-r-lg";
const spine = (color: string) => ({
  borderColor: color,
  background: `linear-gradient(90deg, color-mix(in srgb, ${color} 9%, transparent), transparent 34%)`,
});

// Career totals across every season: saved season totals (imported or
// finalized), plus the current season's live totals until it's finalized.
// Regular season only, matching the season stats page.
export default async function AllTimeStatsPage() {
  const supabase = await createSupabaseServerClient();

  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("season_player_stats")
      .select(
        "season_id, player_id, team_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made, goals_against, penalty_shots_faced, penalty_shots_saved, wins, losses, ot_losses",
      )
      .order("season_id")
      .order("player_id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }

  const { data: seasons } = await supabase
    .from("seasons")
    .select("id, start_date, is_current")
    .order("start_date");
  const current = (seasons ?? []).find((s) => s.is_current);
  if (current && !rows.some((r) => r.season_id === current.id)) {
    const inputs = await getSeasonFinalizeInputs(current.id);
    const live = computeSeasonTotals(inputs.games, inputs.roster, inputs.appearances, inputs.events);
    rows.push(...live.map((t) => ({ season_id: current.id, ...t })));
  }

  const [{ data: players }, { data: teams }] = await Promise.all([
    supabase.from("players").select("id, first_name, last_name"),
    supabase.from("teams").select("id, name, slug, color"),
  ]);
  const nameById = new Map((players ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const teamById = new Map((teams ?? []).map((t) => [t.id, { name: t.name, slug: t.slug, color: t.color }]));
  const seasonOrder = new Map((seasons ?? []).map((s, i) => [s.id, i]));

  // Oldest → newest so the last row seen sets the player's most recent team.
  rows.sort((a, b) => (seasonOrder.get(a.season_id) ?? 0) - (seasonOrder.get(b.season_id) ?? 0));

  const skaters = new Map<string, Skater>();
  const goalies = new Map<string, Goalie>();
  const seasonsPlayed = new Set<string>();
  for (const r of rows) {
    if (r.games_played === 0) continue;
    seasonsPlayed.add(r.season_id);
    const name = nameById.get(r.player_id);
    if (!name) continue;
    const team = r.team_id ? teamById.get(r.team_id) : undefined;

    if (r.position === "goalie") {
      const g = goalies.get(r.player_id) ?? {
        id: r.player_id, name, gp: 0, w: null, l: null, otl: null, ga: 0, ps_faced: 0, ps_saved: 0,
      };
      g.team = team ?? g.team;
      g.gp += r.games_played;
      g.ga += r.goals_against ?? 0;
      g.ps_faced += r.penalty_shots_faced ?? 0;
      g.ps_saved += r.penalty_shots_saved ?? 0;
      // Record only exists for seasons with game results; null until one does.
      if (r.wins != null) {
        g.w = (g.w ?? 0) + r.wins;
        g.l = (g.l ?? 0) + (r.losses ?? 0);
        g.otl = (g.otl ?? 0) + (r.ot_losses ?? 0);
      }
      goalies.set(r.player_id, g);
    } else {
      const s = skaters.get(r.player_id) ?? {
        id: r.player_id, name, gp: 0, goals: 0, assists: 0, points: 0, penalties: 0, ps_taken: 0, ps_made: 0,
      };
      s.team = team ?? s.team;
      s.gp += r.games_played;
      s.goals += r.goals;
      s.assists += r.assists;
      s.points += r.goals + r.assists;
      s.penalties += r.penalties;
      s.ps_taken += r.penalty_shots_taken;
      s.ps_made += r.penalty_shots_made;
      skaters.set(r.player_id, s);
    }
  }

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="rise flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SectionHeader
            eyebrow="The Record Book"
            title="All-Time Stats"
            subtitle={`Career totals · ${seasonsPlayed.size} season${seasonsPlayed.size === 1 ? "" : "s"}`}
            size="lg"
            as="h1"
          />
        </div>
        <Link
          href="/stats"
          className="mt-1 shrink-0 eyebrow inline-flex items-center min-h-11 px-3 rounded-[2px] border border-rule-strong bg-board-3 text-ice hover:border-ice/60 transition-colors"
        >
          ← Season stats
        </Link>
      </div>

      <section className={`rise delay-1 ${SPINE_CLS}`} style={spine("var(--ice)")}>
        <SectionHeader eyebrow="Skaters" title="Career Skater Stats" />
        <SkaterTable rows={[...skaters.values()]} />
      </section>

      <section className={`rise delay-2 ${SPINE_CLS}`} style={spine("var(--goal)")}>
        <SectionHeader eyebrow="Between The Pipes" title="Career Goalie Stats" />
        <GoalieTable rows={[...goalies.values()]} />
      </section>

      <p className="rise delay-2 eyebrow normal-case tracking-[0.06em] text-ink-faint">
        Regular season only. Team shows each player&apos;s most recent team. W-L-OTL counts only
        seasons with game results (not imported seasons). Includes the current season&apos;s games
        played so far.
      </p>
    </div>
  );
}
