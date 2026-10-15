"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPost } from "@/app/post-actions";
import { BODY_MAX } from "@/lib/board";

const smallBtn =
  "min-h-8 px-3 rounded-full text-[12px] font-semibold border border-rule text-ink-dim hover:text-ink hover:border-rule-strong disabled:opacity-50";
const postBtn =
  "min-h-8 px-4 rounded-full text-[12px] font-semibold bg-ice text-board hover:opacity-90 disabled:opacity-40";

// Compose box for a new top-level post, or (with parentId) an inline reply;
// `onDone` closes the reply box after posting or on Cancel.
export function PostForm({
  gameId,
  parentId,
  onDone,
}: {
  gameId: string | null;
  parentId?: string;
  onDone?: () => void;
}) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const over = body.trim().length > BODY_MAX;
  const submit = () =>
    startTransition(async () => {
      const res = await createPost({ body, gameId, parentId });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Posted");
        setBody("");
        onDone?.();
        router.refresh();
      }
    });

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label={parentId ? "Reply" : "New post"}
        placeholder={parentId ? "Post your reply" : "What's happening? (markdown ok)"}
        rows={parentId ? 2 : 3}
        autoFocus={!!parentId}
        className="w-full bg-board-2 border border-rule-strong rounded-md p-2 text-[14px] leading-relaxed text-ink"
      />
      <div className="flex items-center gap-2">
        <span className={`text-[12px] ${over ? "text-goal" : "text-ink-faint"}`}>
          {body.trim().length}/{BODY_MAX}
        </span>
        {onDone && (
          <button type="button" disabled={pending} className={`${smallBtn} ml-auto`} onClick={onDone}>
            Cancel
          </button>
        )}
        <button
          type="button"
          disabled={pending || over || !body.trim()}
          className={`${postBtn} ${onDone ? "" : "ml-auto"}`}
          onClick={submit}
        >
          {pending ? "Posting…" : parentId ? "Reply" : "Post"}
        </button>
      </div>
    </div>
  );
}
