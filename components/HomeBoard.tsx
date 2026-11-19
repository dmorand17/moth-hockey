import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { PostThread } from "@/components/PostThread";
import { getBoardViewer } from "@/lib/auth";
import { getBoardPosts, getBoardSeasons } from "@/lib/queries";
import { boardSeasonWindow, parseCursor } from "@/lib/board";

const navLink = "text-[14px] font-semibold text-ice hover:text-ink transition-colors inline-flex items-center min-h-11";

function boardHref(params: { season?: string; before?: string }) {
  const q = new URLSearchParams();
  if (params.season) q.set("boardSeason", params.season);
  if (params.before) q.set("before", params.before);
  const qs = q.toString();
  return `/${qs ? `?${qs}` : ""}#board`;
}

// The site-wide message board, rendered on the homepage and scoped to a season:
// the current season by default, earlier seasons as a read-only archive.
// `before` / `boardSeason` are the raw URL params; links jump back to #board.
export async function HomeBoard({
  before,
  boardSeason,
}: {
  before?: string;
  boardSeason?: string;
}) {
  const cursor = parseCursor(before);
  const scope = boardSeasonWindow(await getBoardSeasons(), boardSeason);
  const [{ threads, nextCursor }, viewer] = await Promise.all([
    getBoardPosts({ before: cursor, from: scope?.from, to: scope?.to }),
    getBoardViewer(),
  ]);
  const archived = !!scope && !scope.isDefault;
  const seasonParam = archived ? scope.season.id : undefined;

  return (
    <section id="board" className="rise delay-3 space-y-4">
      <SectionHeader
        eyebrow={scope ? (archived ? `${scope.season.name} · Archive` : scope.season.name) : "Message board"}
        title="Locker Room"
        linkHref={archived ? "/#board" : undefined}
        linkLabel={archived ? "Current season" : undefined}
      />
      <PostThread
        threads={threads}
        viewer={viewer}
        gameId={null}
        empty={archived ? `No posts from ${scope.season.name}.` : "No posts this season yet — start the conversation."}
        visible={5}
        archived={archived ? scope.season.name : undefined}
      />
      {(nextCursor || cursor || scope?.older) && (
        <nav className="flex gap-4">
          {cursor && (
            <Link href={boardHref({ season: seasonParam })} className={navLink}>
              ← Newest posts
            </Link>
          )}
          {nextCursor ? (
            <Link href={boardHref({ season: seasonParam, before: nextCursor })} className={`${navLink} ml-auto`}>
              Older posts →
            </Link>
          ) : (
            scope?.older && (
              <Link href={boardHref({ season: scope.older.id })} className={`${navLink} ml-auto`}>
                {scope.older.name} posts →
              </Link>
            )
          )}
        </nav>
      )}
    </section>
  );
}
