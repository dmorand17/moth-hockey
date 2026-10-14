import Link from "next/link";
import { PostBody } from "@/components/PostBody";
import { PostCard } from "@/components/PostCard";
import { PostForm } from "@/components/PostForm";
import type { BoardViewer } from "@/lib/auth";
import { formatRelative, type Post, type Thread } from "@/lib/board";

// Composer (or why you can't post) followed by top-level posts and their replies.
// Shared by /board (gameId = null) and the game page discussion.
export function PostThread({
  threads,
  viewer,
  gameId,
  empty,
}: {
  threads: Thread[];
  viewer: BoardViewer | null;
  gameId: string | null;
  empty: string;
}) {
  const now = new Date();
  const canPost = !!viewer?.isLinked;
  const card = (post: Post) => (
    <PostCard
      post={post}
      when={formatRelative(post.createdAt, now)}
      canEdit={!!viewer && (viewer.userId === post.authorId || viewer.isAdmin)}
      canDelete={!!viewer?.isAdmin}
    >
      <PostBody body={post.body} />
    </PostCard>
  );

  return (
    <div className="space-y-4">
      {!viewer ? (
        <p className="text-[14px] text-ink-dim">
          <Link href="/login" className="text-ice hover:underline">
            Sign in to post
          </Link>
        </p>
      ) : !viewer.isLinked ? (
        <p className="text-[14px] text-ink-dim">Your account isn&apos;t linked to a player yet — ask an admin.</p>
      ) : (
        <div className="panel p-4">
          <PostForm gameId={gameId} />
        </div>
      )}

      {threads.length === 0 ? (
        <p className="text-[14px] text-ink-dim">{empty}</p>
      ) : (
        <ol className="space-y-3">
          {threads.map((t) => (
            <li key={t.id} className="panel p-4 space-y-3">
              {card(t)}
              {(t.replies.length > 0 || canPost) && (
                <ol className="space-y-3 border-l-2 border-rule pl-4 ml-1">
                  {t.replies.map((r) => (
                    <li key={r.id}>{card(r)}</li>
                  ))}
                  {canPost && (
                    <li>
                      <PostForm gameId={gameId} parentId={t.id} />
                    </li>
                  )}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
