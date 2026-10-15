import Link from "next/link";
import { PostBody } from "@/components/PostBody";
import { Avatar, PostCard } from "@/components/PostCard";
import { PostForm } from "@/components/PostForm";
import { ShowMore } from "@/components/ShowMore";
import type { BoardViewer } from "@/lib/auth";
import { formatRelative, type Post, type Thread } from "@/lib/board";

// An X-style feed in one panel: composer (or why you can't post) on top, then
// top-level posts with their replies hung off a thread line under the avatar.
// Shared by the homepage board (gameId = null) and the game page discussion.
export function PostThread({
  threads,
  viewer,
  gameId,
  empty,
  visible,
}: {
  threads: Thread[];
  viewer: BoardViewer | null;
  gameId: string | null;
  empty: string;
  /** Show only this many threads until "Show more" is clicked. Omit to show all. */
  visible?: number;
}) {
  const now = new Date();
  const canPost = !!viewer?.isLinked;
  const card = (post: Post, opts: { replyCount?: number; size?: "md" | "sm" } = {}) => (
    <PostCard
      post={post}
      when={formatRelative(post.createdAt, now)}
      canEdit={!!viewer && (viewer.userId === post.authorId || viewer.isAdmin)}
      canDelete={!!viewer?.isAdmin}
      reply={canPost && opts.replyCount !== undefined ? { gameId } : undefined}
      replyCount={opts.replyCount}
      size={opts.size}
    >
      <PostBody body={post.body} />
    </PostCard>
  );

  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-3 border-b border-rule">
        {!viewer ? (
          <div className="flex items-center justify-between gap-3 py-1">
            <p className="text-[14px] text-ink-dim">Join the conversation.</p>
            <Link
              href="/login"
              className="inline-flex items-center min-h-9 px-5 rounded-full text-[14px] font-bold bg-ice text-board hover:brightness-110 transition"
            >
              Sign in to post
            </Link>
          </div>
        ) : !viewer.isLinked ? (
          <p className="py-1 text-[14px] text-ink-dim">Your account isn&apos;t linked to a player yet — ask an admin.</p>
        ) : (
          <div className="flex gap-3">
            <Avatar name={viewer.name} team={viewer.team} size="md" />
            <div className="min-w-0 flex-1 pt-1">
              <PostForm gameId={gameId} />
            </div>
          </div>
        )}
      </div>

      {threads.length === 0 ? (
        <p className="px-4 py-8 text-center text-[14px] text-ink-faint">{empty}</p>
      ) : (
        <ol className="divide-y divide-rule">
          <ShowMore visible={visible ?? threads.length}>
            {threads.map((t) => (
              <li key={t.id} className="px-4 pt-3 pb-2 hover:bg-board-2/60 transition-colors">
                {card(t, { replyCount: t.replies.length })}
                {t.replies.length > 0 && (
                  <ol className="relative mt-1 space-y-3 pb-1 pl-[52px] before:absolute before:left-[19px] before:-top-1 before:bottom-5 before:w-0.5 before:rounded-full before:bg-rule-strong">
                    {t.replies.map((r) => (
                      <li key={r.id}>{card(r, { size: "sm" })}</li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ShowMore>
        </ol>
      )}
    </div>
  );
}
