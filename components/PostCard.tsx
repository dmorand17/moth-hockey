"use client";

import Link from "next/link";
import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deletePost, editPost } from "@/app/post-actions";
import { PostForm } from "@/components/PostForm";
import type { ActionResult } from "@/lib/action-result";
import { BODY_MAX, type Post, type PostTeam } from "@/lib/board";

const pill =
  "min-h-8 px-3.5 rounded-full text-[13px] font-semibold border border-rule-strong text-ink-dim hover:text-ink hover:bg-board-3 transition-colors disabled:opacity-50";
const savePill =
  "min-h-8 px-4 rounded-full text-[13px] font-bold bg-ice text-board hover:brightness-110 transition disabled:opacity-40";

const icons = {
  reply: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm11-15 4 4",
  delete: "M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
};

// X-style action: muted icon (+ optional count) with a tinted circular hover.
function Action({
  icon,
  label,
  tone,
  count,
  onClick,
  disabled,
}: {
  icon: keyof typeof icons;
  label: string;
  tone: "ice" | "ink" | "goal";
  count?: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  const hover = {
    ice: "hover:text-ice [&:hover>span:first-child]:bg-ice/15",
    ink: "hover:text-ink [&:hover>span:first-child]:bg-ink/10",
    goal: "hover:text-goal [&:hover>span:first-child]:bg-goal/15",
  }[tone];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`group inline-flex items-center gap-0.5 text-[13px] text-ink-faint transition-colors disabled:opacity-50 ${hover}`}
    >
      <span className="grid place-items-center h-8 w-8 -ml-2 rounded-full transition-colors">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-[17px] w-[17px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={icons[icon]} />
        </svg>
      </span>
      {count ? <span className="tnum">{count}</span> : null}
    </button>
  );
}

// Initials disc in the author's team color — the feed's "jersey".
export function Avatar({ name, team, size }: { name: string | null; team: PostTeam | null; size: "md" | "sm" }) {
  const initials = name
    ? name
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";
  const style: CSSProperties | undefined = team
    ? {
        background: `linear-gradient(145deg, color-mix(in srgb, ${team.color} 55%, var(--board-3)), color-mix(in srgb, ${team.color} 22%, var(--board)))`,
        boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${team.color} 70%, transparent), 0 0 14px -4px ${team.color}`,
      }
    : undefined;
  return (
    <span
      aria-hidden
      style={style}
      className={`shrink-0 grid place-items-center rounded-full font-display tracking-[0.06em] text-ink select-none ${
        team ? "" : "bg-board-3 ring-1 ring-rule-strong text-ink-faint"
      } ${size === "md" ? "h-10 w-10 text-[17px]" : "h-8 w-8 text-[14px]"}`}
    >
      {initials}
    </span>
  );
}

// Team name as a small tinted chip in the team's color.
function TeamChip({ team }: { team: PostTeam }) {
  return (
    <Link
      href={`/teams/${team.slug}`}
      className="inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-[1px] text-[11px] font-bold uppercase tracking-[0.07em] leading-[18px] hover:brightness-125 transition"
      style={{
        color: `color-mix(in srgb, ${team.color} 72%, white)`,
        background: `color-mix(in srgb, ${team.color} 16%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${team.color} 38%, transparent)`,
      }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: team.color }} />
      {team.name}
    </Link>
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
  size = "md",
  children,
}: {
  post: Post;
  when: string;
  canEdit: boolean;
  canDelete: boolean;
  reply?: { gameId: string | null };
  replyCount?: number;
  size?: "md" | "sm";
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
  const team = post.author?.team ?? null;
  const showActions = !editing && (reply || canEdit || canDelete);

  return (
    <article className="flex gap-3">
      <Avatar name={post.author?.name ?? null} team={team} size={size} />
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] leading-5">
          {post.author ? (
            <Link href={`/players/${post.author.playerId}`} className="font-bold text-ink hover:underline underline-offset-2">
              {post.author.name}
            </Link>
          ) : (
            <span className="font-bold text-ink-dim">Former player</span>
          )}
          {team && <TeamChip team={team} />}
          <span className="text-ink-faint text-[13px]">
            · <time dateTime={post.createdAt}>{when}</time>
            {post.editedAt && <span title="Edited"> · edited</span>}
          </span>
        </header>

        <div className="mt-0.5">
          {editing ? (
            <div className="space-y-2 pt-1">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-label="Edit post"
                rows={3}
                autoFocus
                className="w-full resize-y bg-board-2 border border-rule-strong focus:border-ice/60 outline-none rounded-xl px-3 py-2 text-[15px] leading-normal text-ink transition-colors"
              />
              <div className="flex items-center gap-2">
                <span className={`text-[12px] tnum ${over ? "text-goal" : "text-ink-faint"}`}>
                  {body.trim().length}/{BODY_MAX}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  className={`${pill} ml-auto`}
                  onClick={() => {
                    setBody(post.body);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending || !body.trim() || over}
                  className={savePill}
                  onClick={() => run(() => editPost({ id: post.id, body }), () => setEditing(false))}
                >
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            children
          )}
        </div>

        {showActions && (
          <div className="mt-1 -mb-1 flex items-center gap-6">
            {reply && (
              <Action icon="reply" label="Reply" tone="ice" count={replyCount} onClick={() => setReplying((v) => !v)} />
            )}
            {canEdit && (
              <Action
                icon="edit"
                label="Edit"
                tone="ink"
                disabled={pending}
                onClick={() => {
                  setBody(post.body);
                  setEditing(true);
                }}
              />
            )}
            {canDelete && (
              <Action
                icon="delete"
                label="Delete"
                tone="goal"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Delete this post? Any replies will be deleted too.")) run(() => deletePost({ id: post.id }));
                }}
              />
            )}
          </div>
        )}

        {reply && replying && (
          <div className="mt-2">
            <PostForm gameId={reply.gameId} parentId={post.id} onDone={() => setReplying(false)} />
          </div>
        )}
      </div>
    </article>
  );
}
