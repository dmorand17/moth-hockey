"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPost } from "@/app/post-actions";
import { BODY_MAX } from "@/lib/board";

const btn =
  "min-h-[40px] px-3 text-[12px] font-semibold uppercase tracking-[0.08em] rounded-[2px] border border-rule bg-board-3 text-ink-dim hover:border-rule-strong hover:text-ink disabled:opacity-50";

// Compose box for a new top-level post, or (with parentId) a reply that
// stays collapsed behind a "Reply" button until opened.
export function PostForm({ gameId, parentId }: { gameId: string | null; parentId?: string }) {
  const [open, setOpen] = useState(!parentId);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button type="button" className={btn} onClick={() => setOpen(true)}>
        Reply
      </button>
    );
  }

  const over = body.trim().length > BODY_MAX;
  const submit = () =>
    startTransition(async () => {
      const res = await createPost({ body, gameId, parentId });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Posted");
        setBody("");
        if (parentId) setOpen(false);
        router.refresh();
      }
    });

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label={parentId ? "Reply" : "New post"}
        placeholder={parentId ? "Write a reply… (markdown ok)" : "Write a post… (markdown ok)"}
        rows={parentId ? 3 : 4}
        className="w-full bg-board-2 border border-rule-strong rounded-[2px] p-2 text-[14px] leading-relaxed text-ink"
      />
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending || over || !body.trim()} className={btn} onClick={submit}>
          {pending ? "Posting…" : parentId ? "Post reply" : "Post"}
        </button>
        {parentId && (
          <button type="button" disabled={pending} className={btn} onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
        <span className={`ml-auto text-[12px] ${over ? "text-goal" : "text-ink-faint"}`}>
          {body.trim().length}/{BODY_MAX}
        </span>
      </div>
    </div>
  );
}
