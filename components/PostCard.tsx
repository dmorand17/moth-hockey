"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deletePost, editPost } from "@/app/post-actions";
import { PostForm } from "@/components/PostForm";
import type { ActionResult } from "@/lib/action-result";
import { BODY_MAX, type Post } from "@/lib/board";

// Small, borderless feed actions (reply / edit / delete).
const action =
  "inline-flex items-center gap-1.5 min-h-8 -mx-1.5 px-1.5 rounded-full text-[12px] text-ink-faint hover:text-ink hover:bg-board-3 transition-colors disabled:opacity-50";
const smallBtn =
  "min-h-8 px-3 rounded-full text-[12px] font-semibold border border-rule text-ink-dim hover:text-ink hover:border-rule-strong disabled:opacity-50";

const icons = {
  reply: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm11-15 4 4",
  delete: "M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
};

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name]} />
    </svg>
  );
}

// One post in the feed. `children` is the server-rendered markdown body; `when`
// is the relative time computed on the server (avoids hydration mismatches).
// `reply` is set on top-level posts the viewer may reply to.
export function PostCard({
  post,
  when,
  canEdit,
  canDelete,
  reply,
  replyCount = 0,
  children,
}: {
  post: Post;
  when: string;
  canEdit: boolean;
  canDelete: boolean;
  reply?: { gameId: string | null };
  replyCount?: number;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [body, setBody] = useState(post.body);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Saved");
        after?.();
        router.refresh();
      }
    });

  const over = body.trim().length > BODY_MAX;

  return (
    <article
      className="border-l-2 pl-3 space-y-1"
      style={{ borderLeftColor: post.author?.team?.color ?? "var(--rule)" }}
    >
      <header className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-tight">
        {post.author ? (
          <Link href={`/players/${post.author.playerId}`} className="font-semibold text-ink hover:underline">
            {post.author.name}
          </Link>
        ) : (
          <span className="font-semibold text-ink-dim">Former player</span>
        )}
        {post.author?.team && (
          <Link href={`/teams/${post.author.team.slug}`} className="text-ink-faint hover:text-ink-dim">
            {post.author.team.name}
          </Link>
        )}
        <span className="text-ink-faint">· {when}</span>
        {post.editedAt && <span className="text-ink-faint">· edited</span>}
      </header>

      {editing ? (
        <div className="space-y-2 pt-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Edit post"
            rows={3}
            autoFocus
            className="w-full bg-board-2 border border-rule-strong rounded-md p-2 text-[14px] leading-relaxed text-ink"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending || !body.trim() || over}
              className={smallBtn}
              onClick={() => run(() => editPost({ id: post.id, body }), () => setEditing(false))}
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={pending}
              className={smallBtn}
              onClick={() => {
                setBody(post.body);
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <span className={`ml-auto text-[12px] ${over ? "text-goal" : "text-ink-faint"}`}>
              {body.trim().length}/{BODY_MAX}
            </span>
          </div>
        </div>
      ) : (
        children
      )}

      {!editing && (reply || canEdit || canDelete) && (
        <div className="flex items-center gap-5 pt-0.5">
          {reply && (
            <button type="button" className={action} onClick={() => setReplying((v) => !v)} aria-label="Reply">
              <Icon name="reply" />
              {replyCount > 0 && <span className="tnum">{replyCount}</span>}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              disabled={pending}
              className={action}
              onClick={() => {
                setBody(post.body);
                setEditing(true);
              }}
              aria-label="Edit"
            >
              <Icon name="edit" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={pending}
              className={`${action} hover:text-goal`}
              onClick={() => {
                if (window.confirm("Delete this post? Any replies will be deleted too.")) run(() => deletePost({ id: post.id }));
              }}
              aria-label="Delete"
            >
              <Icon name="delete" />
            </button>
          )}
        </div>
      )}

      {reply && replying && (
        <div className="pt-1">
          <PostForm gameId={reply.gameId} parentId={post.id} onDone={() => setReplying(false)} />
        </div>
      )}
    </article>
  );
}
