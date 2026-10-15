import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { PostThread } from "@/components/PostThread";
import { getBoardViewer } from "@/lib/auth";
import { getBoardPosts } from "@/lib/queries";
import { parseCursor } from "@/lib/board";

// The site-wide message board, rendered on the homepage. `before` is the raw
// `?before=` cursor from the URL; pagination links jump back to #board.
export async function HomeBoard({ eyebrow, before }: { eyebrow?: string; before?: string }) {
  const cursor = parseCursor(before);
  const [{ threads, nextCursor }, viewer] = await Promise.all([
    getBoardPosts({ before: cursor }),
    getBoardViewer(),
  ]);

  return (
    <section
      id="board"
      className="rise delay-1 scroll-mt-4 rounded-r-lg border-l-[3px] pl-4 sm:pl-6 py-4 sm:py-5 space-y-4"
      style={{
        borderColor: "var(--goal)",
        background:
          "linear-gradient(90deg, color-mix(in srgb, var(--goal) 9%, transparent), transparent 34%)",
      }}
    >
      <SectionHeader eyebrow={eyebrow} title="Locker Room" />
      <PostThread threads={threads} viewer={viewer} gameId={null} empty="No posts yet — start the conversation." />
      {(nextCursor || cursor) && (
        <nav className="flex gap-4">
          {cursor && (
            <Link href="/#board" className="eyebrow hover:text-ink transition-colors inline-flex items-center min-h-11">
              ← Newest posts
            </Link>
          )}
          {nextCursor && (
            <Link
              href={`/?before=${encodeURIComponent(nextCursor)}#board`}
              className="eyebrow hover:text-ink transition-colors inline-flex items-center min-h-11 ml-auto"
            >
              Older posts →
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
