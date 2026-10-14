import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { PostThread } from "@/components/PostThread";
import { getBoardViewer } from "@/lib/auth";
import { getBoardPosts } from "@/lib/queries";
import { parseCursor } from "@/lib/board";

type SearchParams = Promise<{ before?: string }>;

export default async function BoardPage({ searchParams }: { searchParams: SearchParams }) {
  const { before } = await searchParams;
  const cursor = parseCursor(before);
  const [{ threads, nextCursor }, viewer] = await Promise.all([
    getBoardPosts({ before: cursor }),
    getBoardViewer(),
  ]);

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="rise">
        <SectionHeader eyebrow="Locker Room" title="Message Board" size="lg" as="h1" />
      </div>
      <section className="rise delay-1">
        <PostThread threads={threads} viewer={viewer} gameId={null} empty="No posts yet — start the conversation." />
      </section>
      {(nextCursor || cursor) && (
        <nav className="rise delay-2 flex gap-4">
          {cursor && (
            <Link href="/board" className="eyebrow hover:text-ink transition-colors inline-flex items-center min-h-11">
              ← Newest posts
            </Link>
          )}
          {nextCursor && (
            <Link
              href={`/board?before=${encodeURIComponent(nextCursor)}`}
              className="eyebrow hover:text-ink transition-colors inline-flex items-center min-h-11 ml-auto"
            >
              Older posts →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
