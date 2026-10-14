"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deletePost, editPost } from "@/app/board/actions";
import type { ActionResult } from "@/lib/action-result";
import { BODY_MAX, type Post } from "@/lib/board";

const btn =
  "min-h-[40px] px-3 text-[12px] font-semibold uppercase tracking-[0.08em] rounded-[2px] border border-rule bg-board-3 text-ink-dim hover:border-rule-strong hover:text-ink disabled:opacity-50";

// One post. `children` is the server-rendered markdown body; `when` is the
// relative time computed on the server (avoids hydration mismatches).
export function PostCard({
  post,
  when,
  canEdit,
  canDelete,
  children,
}: {
  post: Post;
  when: string;
  canEdit: boolean;
  canDelete: boolean;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
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

  return (
    <article className="space-y-2">
      <header className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
        {post.author ? (
          <Link href={`/players/${post.author.playerId}`} className="font-semibold text-ink hover:text-ice">
            {post.author.name}
          </Link>
        ) : (
          <span className="font-semibold text-ink-dim">Former player</span>
        )}
        <span className="text-ink-faint">· {when}</span>
        {post.editedAt && <span className="text-ink-faint">(edited)</span>}
      </header>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Edit post"
            rows={4}
            className="w-full bg-board-2 border border-rule-strong rounded-[2px] p-2 text-[14px] leading-relaxed text-ink"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending || !body.trim() || body.trim().length > BODY_MAX}
              className={btn}
              onClick={() => run(() => editPost({ id: post.id, body }), () => setEditing(false))}
            >
              Save
            </button>
            <button
              type="button"
              disabled={pending}
              className={btn}
              onClick={() => {
                setBody(post.body);
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <span className="ml-auto text-[12px] text-ink-faint">
              {body.trim().length}/{BODY_MAX}
            </span>
          </div>
        </div>
      ) : (
        children
      )}

      {!editing && (canEdit || canDelete) && (
        <div className="flex gap-2">
          {canEdit && (
            <button type="button" disabled={pending} className={btn} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={pending}
              className={btn}
              onClick={() => {
                if (window.confirm("Delete this post? Any replies will be deleted too.")) run(() => deletePost({ id: post.id }));
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </article>
  );
}
