import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SectionHeader } from "@/components/SectionHeader";
import { getCurrentSeason, getStandings } from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { teamAbbr } from "@/lib/format";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Teams",
  description: "Every team in the league with its record and points.",
};

export default async function TeamsPage() {
  const season = await getCurrentSeason();
  if (!season) return <NoSeason />;
  const supabase = await createSupabaseServerClient();
  const [{ data: teams }, standings] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, slug, color")
      .eq("season_id", season.id)
      .order("name"),
    getStandings(season.id),
  ]);

  const recordByTeamId = new Map(
    standings.map((r, i) => [r.team_id, { w: r.w, l: r.l, otl: r.otl, pts: r.pts, rank: i + 1 }]),
  );
  const list = teams ?? [];

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="rise">
        <SectionHeader
          eyebrow={season.name}
          title="Teams"
          subtitle={`${list.length} teams in the league`}
          size="lg"
          as="h1"
        />
      </div>

      <ul className="rise delay-1 grid gap-3">
        {list.map((t) => {
          const rec = recordByTeamId.get(t.id);
          return (
            <li key={t.id}>
              <Link
                href={`/teams/${t.slug}`}
                className="panel h-full p-4 md:p-5 flex items-center gap-4 hover:bg-board-hover hover:border-rule-strong transition-colors group"
              >
                <span
                  aria-hidden
                  className="swatch h-12 w-12 shrink-0 rounded-md flex items-center justify-center font-display text-[22px] text-board"
                  style={{ background: t.color }}
                >
                  {teamAbbr(t.name).slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[18px] font-bold leading-6 text-ink group-hover:text-ice transition-colors">
                    {t.name}
                  </h2>
                  {rec ? (
                    <p className="text-[14px] text-ink-faint tnum">
                      <span className="text-ink-dim">
                        {rec.w}-{rec.l}-{rec.otl}
                      </span>{" "}
                      W-L-OTL · <span className={rec.rank === 1 ? "text-gold font-semibold" : ""}>#{rec.rank}</span>
                    </p>
                  ) : (
                    <p className="text-[14px] text-ink-faint">No games yet</p>
                  )}
                </div>
                {rec && (
                  <div className="text-right shrink-0">
                    <div className="digit text-[28px] leading-none text-ink">{rec.pts}</div>
                    <div className="mt-1 text-[12px] font-semibold text-ink-faint">PTS</div>
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
