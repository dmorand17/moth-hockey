import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AwardWinners } from "@/components/AwardWinners";
import { DataTable } from "@/components/DataTable";
import { GameList } from "@/components/GameRow";
import { PostThread } from "@/components/PostThread";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamBadge } from "@/components/TeamBadge";
import { RecapGameRow, RecapLeaders, RecapMoments, RecapNumbers, RecapPath, type Names } from "@/components/recap/parts";
import { HeroPhoto } from "@/components/recap/HeroPhoto";
import { JumpBar } from "@/components/recap/JumpBar";
import { PhotoGallery } from "@/components/recap/PhotoGallery";
import { MediaAdmin } from "@/components/recap/MediaAdmin";
import { MediaFiles } from "@/components/recap/MediaFiles";
import { RecapSummary } from "@/components/recap/RecapSummary";
import { SummaryAdmin } from "@/components/recap/SummaryAdmin";
import { ShareButton } from "@/components/recap/ShareButton";
import { getBoardViewer, getSessionIfRole } from "@/lib/auth";
import { getRecapSummary, getSeasonMedia, getSeasonRecap } from "@/lib/queries";
import { mediaKind, mediaPrefix, splitHero } from "@/lib/media";
import { computeRecap } from "@/lib/recap-summary/facts";
import { jumpLinks } from "@/lib/season-recap";

type Params = Promise<{ slug: string }>;

// Generating the AI summary (a server action on this page) can take two
// 75s model calls (primary + fallback).
export const maxDuration = 180;

// One fetch per request for both metadata and the page.
const load = cache(getSeasonRecap);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const r = await load(slug);
  if (!r) return { title: "Season Recap" };
  const champion = r.championTeamId ? r.teams.get(r.championTeamId)?.name : null;
  return {
    title: `${r.season.name} Season Recap`,
    description: champion
      ? `${champion} won the ${r.season.name} season. Awards, standings, leaders and playoff results from M.O.T.H Hockey.`
      : `The ${r.season.name} season of M.O.T.H Hockey: awards, standings and leaders.`,
  };
}

export default async function SeasonRecapPage({ params }: { params: Params }) {
  const { slug } = await params;
  const r = await load(slug);
  if (!r) notFound();

  const names: Names = { teams: r.teams, players: r.players };
  const c = computeRecap(r);
  const { regular, playoffTotals, regNumbers, poNumbers, regMoments, poMoments, path } = c;
  const champion = r.championTeamId ? r.teams.get(r.championTeamId) : undefined;
  const championRow = r.standings?.find((s) => s.team_id === r.championTeamId);
  const final = path.find((g) => g.playoff_round === "final");
  const title = `${r.season.name} Season Recap`;

  const hero = (
    <section className="rise space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Season recap</p>
          <h1 className="font-display text-[40px] leading-[44px] md:text-[56px] md:leading-[64px] tracking-[0.02em]">{r.season.name}</h1>
        </div>
        <ShareButton title={title} />
      </div>
      {champion && (
        <div className="panel overflow-clip flex">
          <span aria-hidden className="swatch w-1 shrink-0" style={{ background: champion.color }} />
          <div className="flex-1 p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-gold!">🏆 Champions</p>
              <TeamBadge name={champion.name} slug={champion.slug} color={champion.color} size="lg" />
            </div>
            {championRow && (
              <p className="text-[14px] text-ink-faint">
                Regular season <span className="tnum font-semibold text-ink">{championRow.w}-{championRow.l}-{championRow.otl}</span> ·{" "}
                <span className="tnum font-semibold text-ink">{championRow.pts}</span> PTS
              </p>
            )}
          </div>
        </div>
      )}
      {final && (
        <div>
          <p className="eyebrow mb-2">The final</p>
          <GameList>
            <RecapGameRow game={final} names={names} />
          </GameList>
        </div>
      )}
    </section>
  );

  if (r.state === "in-progress") {
    return (
      <div className="space-y-8 md:space-y-10">
        {hero}
        <p className="panel-bare px-4 py-5 text-[16px] text-ink-dim">
          Recap available when the season ends. Here&apos;s how the leaders stand so far.
        </p>
        <RecapLeaders eyebrow="Regular season" totals={regular} minGoalieGames={c.minGoalieGames} names={names} />
      </div>
    );
  }

  const [viewer, admin, summary, media] = await Promise.all([
    getBoardViewer(),
    getSessionIfRole(["admin"]),
    getRecapSummary(r.season.id),
    getSeasonMedia(r.season.id),
  ]);
  // The first photo leads the page (hero); the gallery holds everything else.
  const split = splitHero(media.filter((m) => mediaKind(m.contentType) !== "file"));
  const visual = split.hero ? [split.hero, ...split.rest] : split.rest;
  const galleryCount = split.rest.length;
  const files = media.filter((m) => mediaKind(m.contentType) === "file");
  const showMedia = galleryCount > 0 || files.length > 0 || !!admin;
  const livePublished = summary.published?.published ? summary.published : null;
  const showSummary = !!admin || !!livePublished;
  const hasSeason = !!regNumbers || !!r.standings || !!r.historical || regular.length > 0;
  const links = jumpLinks({ summary: showSummary, awards: r.awards.length > 0, season: hasSeason, playoffs: path.length > 0, media: showMedia, board: true });
  // Headings clear the sticky header plus the jump bar.
  const anchor = "scroll-mt-[calc(var(--header-h)+64px)]!";

  return (
    <div className="space-y-8 md:space-y-12">
      {hero}
      {split.hero && <HeroPhoto items={visual} seasonName={r.season.name} />}
      <JumpBar links={links} />

      {showSummary && (
        <section id="summary" className={anchor}>
          <SectionHeader eyebrow="Season summary" title="The story of the season" />
          {admin ? (
            <SummaryAdmin slug={slug} published={summary.published} draft={summary.draft} />
          ) : (
            livePublished && <RecapSummary markdown={livePublished.markdown} editedAt={livePublished.edited_at} />
          )}
        </section>
      )}

      {r.awards.length > 0 && (
        <section id="awards" className={anchor}>
          <SectionHeader eyebrow="The hardware" title="Award winners" />
          <div className="lg:hidden">
            <AwardWinners awards={r.awards} layout="row" totals={regular} />
          </div>
          <div className="hidden lg:block">
            <AwardWinners awards={r.awards} layout="grid" totals={regular} />
          </div>
        </section>
      )}

      <div id="season" className={`space-y-8 md:space-y-12 ${anchor}`}>
        {regNumbers && <RecapNumbers eyebrow="Regular season" numbers={regNumbers} />}

        {(r.standings || r.historical) && (
          <section>
            <SectionHeader eyebrow="Regular season" title="Final standings" linkHref={`/standings?season=${r.season.id}`} linkLabel="Standings" />
            {r.standings ? (
              <DataTable caption={`${r.season.name} final standings`}>
                <thead>
                  <tr>
                    <th scope="col" className="text-left w-8 pl-3 sm:pl-4">#</th>
                    <th scope="col" className="text-left">Team</th>
                    <th scope="col" className="text-right sm:w-14">GP</th>
                    <th scope="col" className="text-right sm:w-14">W-L-OTL</th>
                    <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">GF</th>
                    <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">GA</th>
                    <th scope="col" className="text-right sm:w-14 pr-3 sm:pr-4">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {r.standings.map((row, i) => (
                    <tr key={row.team_id}>
                      <td className={`pl-3 sm:pl-4 ${i === 0 ? "text-gold font-bold" : "text-ink-faint"}`}>{i + 1}</td>
                      <td className="max-w-0 w-full">
                        <TeamBadge name={row.name} slug={row.slug} color={row.color} className="max-w-full" wrap />
                      </td>
                      <td className="text-right text-ink-dim">{row.gp}</td>
                      <td className="text-right text-ink-dim whitespace-nowrap">{row.w}-{row.l}-{row.otl}</td>
                      <td className="text-right text-ink-dim hidden sm:table-cell">{row.gf}</td>
                      <td className="text-right text-ink-dim hidden sm:table-cell">{row.ga}</td>
                      <td className="text-right pr-3 sm:pr-4 font-bold text-ink">{row.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <DataTable caption={`${r.season.name} final standings by goal differential`}>
                <thead>
                  <tr>
                    <th scope="col" className="text-left w-8 pl-3 sm:pl-4">#</th>
                    <th scope="col" className="text-left">Team</th>
                    <th scope="col" className="text-right sm:w-14">GF</th>
                    <th scope="col" className="text-right sm:w-14">GA</th>
                    <th scope="col" className="text-right sm:w-14 pr-3 sm:pr-4">DIFF</th>
                  </tr>
                </thead>
                <tbody>
                  {r.historical!.map((row, i) => (
                    <tr key={row.team_id}>
                      <td className="pl-3 sm:pl-4 text-ink-faint">{i + 1}</td>
                      <td className="max-w-0 w-full">
                        <TeamBadge name={row.name} slug={row.slug} color={row.color} className="max-w-full" wrap />
                      </td>
                      <td className="text-right text-ink-dim">{row.gf}</td>
                      <td className="text-right text-ink-dim">{row.ga}</td>
                      <td className="text-right pr-3 sm:pr-4 font-bold text-ink">{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>
        )}

        <RecapLeaders eyebrow="Regular season" totals={regular} minGoalieGames={c.minGoalieGames} names={names} />
        <RecapMoments eyebrow="Regular season" moments={regMoments} games={r.games} names={names} />
      </div>

      {path.length > 0 && (
        <section id="playoffs" className={`space-y-6 ${anchor}`}>
          <SectionHeader eyebrow={poNumbers ? `${poNumbers.games} games · ${poNumbers.goals} goals` : undefined} title="Playoffs" />
          <RecapPath path={path} names={names} />
          <RecapLeaders
            eyebrow="Playoffs"
            totals={playoffTotals}
            minGoalieGames={1}
            names={names}
            skaterKeys={["points"]}
          />
          <RecapMoments eyebrow="Playoffs" moments={poMoments} games={r.games} names={names} />
        </section>
      )}

      {showMedia && (
        <section id="media" className={`space-y-3 ${anchor}`}>
          <SectionHeader title="Photos & video" />
          {admin ? (
            <MediaAdmin
              slug={slug}
              prefix={mediaPrefix(slug, process.env.VERCEL_ENV)}
              seasonName={r.season.name}
              items={media}
              uploadsEnabled={!!process.env.BLOB_READ_WRITE_TOKEN}
            />
          ) : (
            <>
              {galleryCount > 0 && <PhotoGallery items={visual} offset={split.hero ? 1 : 0} seasonName={r.season.name} />}
              <MediaFiles items={files} />
            </>
          )}
        </section>
      )}

      <section id="board" className={anchor}>
        <SectionHeader
          eyebrow={`${r.season.name} message board`}
          title="Locker Room"
          linkHref={`/?boardSeason=${r.season.id}#board`}
          linkLabel="Season board"
        />
        <PostThread
          threads={r.board.threads}
          viewer={viewer}
          gameId={null}
          empty={`No Locker Room posts from ${r.season.name}.`}
          visible={5}
          archived={r.season.is_current ? undefined : r.season.name}
        />
      </section>

      <p className="text-[14px] text-ink-faint">
        <Link href="/stats/all-time" className="font-semibold text-ice hover:text-ink inline-flex items-center min-h-11">
          All-time stats <span aria-hidden className="ml-1">→</span>
        </Link>
      </p>
    </div>
  );
}
