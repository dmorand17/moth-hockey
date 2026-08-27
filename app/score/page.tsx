import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayoffChip } from "@/components/PlayoffChip";
import { requireRole } from "@/lib/auth";
import { getCurrentSeason } from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/format";

type Team = { name: string; slug: string; color: string };

type ScoreGame = {
  id: string;
  scheduled_at: string;
  location: string | null;
  status: "scheduled" | "live" | "final";
  kind: "regular" | "playoff";
  playoff_round: "sf1" | "sf2" | "final" | null;
  home_team: Team | null;
  away_team: Team | null;
};

export default async function ScoreHomePage() {
  await requireRole(["admin", "scorekeeper"]);
  const season = await getCurrentSeason();
  if (!season) return <NoSeason />;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("games")
    .select(
      "id, scheduled_at, location, status, kind, playoff_round, home_team:home_team_id(name, slug, color), away_team:away_team_id(name, slug, color)",
    )
    .eq("season_id", season.id)
    .in("status", ["scheduled", "live"])
    .order("scheduled_at", { ascending: true });
  if (error) throw error;

  const games = (data ?? []) as unknown as ScoreGame[];
  const live = games.filter((g) => g.status === "live");
  const scheduled = games.filter((g) => g.status === "scheduled");

  const empty = live.length === 0 && scheduled.length === 0;

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="rise">
        <SectionHeader
          eyebrow="Scorekeeper"
          title="Score a Game"
          subtitle={`${season.name} · pick a game to score`}
          size="lg"
          as="h1"
        />
      </div>

      {empty ? (
        <p className="text-ink-dim">No games to score right now.</p>
      ) : (
        <div className="space-y-6">
          {live.length > 0 && (
            <Section title="Live now" tone="goal">
              {live.map((g) => (
                <ScoreGameRow key={g.id} game={g} />
              ))}
            </Section>
          )}
          {scheduled.length > 0 && (
            <Section title="Scheduled">
              {scheduled.map((g) => (
                <ScoreGameRow key={g.id} game={g} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  tone = "default",
  children,
}: {
  title: string;
  tone?: "default" | "goal";
  children: React.ReactNode;
}) {
  const toneClass = tone === "goal" ? "text-goal" : "text-ink-dim";
  return (
    <section>
      <h3 className={`eyebrow mb-2 ${toneClass}`}>{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ScoreGameRow({ game }: { game: ScoreGame }) {
  const isLive = game.status === "live";
  return (
    <div className="panel p-3 sm:p-4">
      <Link
        href={`/score/${game.id}`}
        className="block min-h-[44px] -m-3 sm:-m-4 p-3 sm:p-4 hover:bg-board-3 active:bg-board-3 transition-colors rounded-[2px]"
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="eyebrow flex items-center gap-2 truncate">
            <span>{formatDate(game.scheduled_at)}</span>
            <span className="text-rule-strong">·</span>
            <span className="text-ink-dim">{formatTime(game.scheduled_at)}</span>
            {game.location && (
              <>
                <span className="text-rule-strong">·</span>
                <span className="text-ink-dim truncate">{game.location}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {game.kind === "playoff" && (
              <PlayoffChip round={game.playoff_round} size="sm" />
            )}
            {isLive ? (
              <span className="chip chip-live">
                <span className="live-dot" /> LIVE
              </span>
            ) : (
              <span className="chip">SCORE</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {game.away_team ? (
            <TeamBadge {...game.away_team} asChild size="md" />
          ) : (
            <span className="text-ink-faint text-[15px] font-medium">TBD</span>
          )}
          <span className="eyebrow text-ink-faint">vs</span>
          {game.home_team ? (
            <TeamBadge {...game.home_team} asChild size="md" />
          ) : (
            <span className="text-ink-faint text-[15px] font-medium">TBD</span>
          )}
        </div>
      </Link>
      {isLive && (
        <div className="mt-3 pt-3 border-t border-rule">
          <Link
            href={`/score/${game.id}/roster`}
            className="eyebrow text-[11px] text-ink-dim hover:text-ink min-h-[36px] inline-flex items-center"
          >
            Edit lineup →
          </Link>
        </div>
      )}
    </div>
  );
}
