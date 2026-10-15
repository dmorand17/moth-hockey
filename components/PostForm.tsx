"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPost } from "@/app/post-actions";
import { BODY_MAX } from "@/lib/board";

const pill =
  "min-h-8 px-3.5 rounded-full text-[13px] font-semibold border border-rule-strong text-ink-dim hover:text-ink hover:bg-board-3 transition-colors disabled:opacity-50";
const postPill =
  "min-h-9 px-5 rounded-full text-[14px] font-bold bg-ice text-board hover:brightness-110 transition disabled:opacity-40 disabled:hover:brightness-100";

// Show the remaining-characters count only once it matters (X-style).
const COUNT_FROM = BODY_MAX - 200;

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

  const length = body.trim().length;
  const over = length > BODY_MAX;
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
    <div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && length > 0 && !over && !pending) submit();
        }}
        aria-label={parentId ? "Reply" : "New post"}
        placeholder={parentId ? "Post your reply" : "Write a post…"}
        rows={parentId ? 2 : 2}
        autoFocus={!!parentId}
        className={`w-full resize-none bg-transparent outline-none text-ink placeholder:text-ink-faint leading-normal field-sizing-content min-h-12 ${
          parentId ? "text-[15px]" : "text-[18px] py-1"
        }`}
      />
      <div className={`flex items-center gap-3 ${parentId ? "pt-1" : "pt-2 mt-1 border-t border-rule"}`}>
        <span className="text-[12px] text-ink-faint hidden sm:inline">Markdown ok · ⌘↵ to post</span>
        <span className="ml-auto flex items-center gap-2">
          {length >= COUNT_FROM && (
            <span className={`text-[12px] tnum ${over ? "text-goal font-bold" : "text-ink-faint"}`}>
              {BODY_MAX - length}
            </span>
          )}
          {onDone && (
            <button type="button" disabled={pending} className={pill} onClick={onDone}>
              Cancel
            </button>
          )}
          <button type="button" disabled={pending || over || length === 0} className={postPill} onClick={submit}>
            {pending ? "Posting…" : parentId ? "Reply" : "Post"}
          </button>
        </span>
      </div>
    </div>
  );
}
