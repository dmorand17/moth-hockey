import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SectionHeader } from "@/components/SectionHeader";
import { getCurrentSeason, getStandings } from "@/lib/queries";

export default async function TeamsPage() {
  const season = await getCurrentSeason();
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
    standings.map((r) => [r.team_id, { w: r.w, l: r.l, otl: r.otl, pts: r.pts }]),
  );

  return (
    <div className="space-y-8">
      <div className="rise">
        <SectionHeader
          eyebrow="The Roster"
          title="Teams"
          subtitle={`${season.name} · ${(teams ?? []).length} teams in the league`}
          size="lg"
        />
      </div>

      <div className="rise delay-1 grid gap-3 md:grid-cols-2">
        {(teams ?? []).map((t, i) => {
          const rec = recordByTeamId.get(t.id);
          return (
            <Link
              key={t.id}
              href={`/teams/${t.slug}`}
              className="panel p-5 group relative overflow-hidden hover:border-rule-strong transition-colors"
            >
              <div
                className="absolute -right-12 -top-12 w-40 h-40 rounded-full opacity-20 blur-2xl pointer-events-none"
                style={{ background: t.color }}
              />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-14 w-14 shrink-0">
                      <div
                        className="absolute inset-0 rounded-sm border"
                        style={{ background: t.color, borderColor: t.color }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center font-display text-board text-[22px] tracking-tight">
                        {t.name
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <div className="eyebrow">Team {String(i + 1).padStart(2, "0")}</div>
                      <h3 className="font-display text-[26px] tracking-[0.03em] leading-none mt-1">
                        {t.name.toUpperCase()}
                      </h3>
                    </div>
                  </div>
                  {rec && (
                    <div className="text-right shrink-0">
                      <div className="digit text-2xl text-ink">{rec.pts}</div>
                      <div className="eyebrow">PTS</div>
                    </div>
                  )}
                </div>
                {rec && (
                  <div className="mt-4 pt-4 border-t border-rule flex items-center justify-between text-[13px]">
                    <div className="flex gap-4">
                      <Stat label="W" value={rec.w} accent="text-ink" />
                      <Stat label="L" value={rec.l} />
                      <Stat label="OTL" value={rec.otl} />
                    </div>
                    <span className="eyebrow group-hover:text-ink transition-colors">
                      Roster →
                    </span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "text-ink-dim" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`digit ${accent}`}>{value}</span>
      <span className="eyebrow text-[10px]">{label}</span>
    </div>
  );
}
