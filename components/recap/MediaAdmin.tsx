"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { MediaFiles } from "@/components/recap/MediaFiles";
import { MediaGrid } from "@/components/recap/MediaGrid";
import type { ActionResult } from "@/lib/action-result";
import { MEDIA_TYPES, PICKER_ACCEPT, formatBytes, maxBytesFor, mediaKind } from "@/lib/media";
import type { SeasonMedia } from "@/lib/queries";
import { deleteSeasonMedia, moveSeasonMedia, recordSeasonMedia, updateMediaCaption } from "@/app/seasons/[slug]/recap/media-actions";

type Upload = { key: string; name: string; pct: number; status: "uploading" | "saving" | "done" | "error"; error?: string };

const iconBtn =
  "h-11 w-11 shrink-0 rounded-md border border-rule-strong bg-board-3 text-[16px] text-ink hover:bg-board-hover disabled:opacity-40 flex items-center justify-center";

const safeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";

// Reads pixel size before upload so the gallery can reserve space; best effort.
async function dimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  try {
    if (file.type.startsWith("image/")) {
      const bmp = await createImageBitmap(file);
      const out = { width: bmp.width, height: bmp.height };
      bmp.close();
      return out;
    }
    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      const out = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight });
        v.onerror = reject;
        v.src = url;
      });
      URL.revokeObjectURL(url);
      return out;
    }
  } catch {
    /* unknown size is fine */
  }
  return { width: null, height: null };
}

// Admin view of the recap gallery: uploader (drop zone on desktop, picker
// button everywhere) plus caption / reorder / delete on every item.
export function MediaAdmin({
  slug,
  prefix,
  seasonName,
  items,
  uploadsEnabled,
}: {
  slug: string;
  prefix: string;
  seasonName: string;
  items: SeasonMedia[];
  uploadsEnabled: boolean;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const patch = (key: string, p: Partial<Upload>) => setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...p } : u)));

  const uploadOne = async (file: File, key: string) => {
    try {
      const { width, height } = await dimensions(file);
      const blob = await upload(`${prefix}${safeName(file.name)}`, file, {
        access: "public",
        handleUploadUrl: "/api/media/upload",
        clientPayload: JSON.stringify({ slug }),
        onUploadProgress: ({ percentage }) => patch(key, { pct: percentage }),
      });
      patch(key, { pct: 100, status: "saving" });
      const res = await recordSeasonMedia({ slug, url: blob.url, width, height });
      if (!res.ok) throw new Error(res.error);
      patch(key, { status: "done" });
    } catch (e) {
      patch(key, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
    }
  };

  const addFiles = async (files: File[]) => {
    const accepted: { file: File; key: string }[] = [];
    for (const file of files) {
      if (!MEDIA_TYPES.includes(file.type)) {
        toast.error(`${file.name}: that file type isn't supported.`);
      } else if (file.size > maxBytesFor(file.type)) {
        toast.error(`${file.name} is too large (max ${formatBytes(maxBytesFor(file.type))}).`);
      } else {
        accepted.push({ file, key: `${file.name}-${file.size}-${Math.random()}` });
      }
    }
    if (accepted.length === 0) return;
    setUploads((list) => [...list.filter((u) => u.status !== "done"), ...accepted.map(({ file, key }) => ({ key, name: file.name, pct: 0, status: "uploading" as const }))]);
    // Two at a time keeps phones on cell data responsive.
    const queue = [...accepted];
    await Promise.all(
      [0, 1].map(async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await uploadOne(next.file, next.key);
      }),
    );
    router.refresh();
  };

  const run = (fn: () => Promise<ActionResult>, quiet = false) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else if (!quiet) toast.success(res.message ?? "Saved");
      router.refresh();
    });

  const visual = items.filter((m) => mediaKind(m.contentType) !== "file");
  const files = items.filter((m) => mediaKind(m.contentType) === "file");
  // Move up/down follows the saved order (what moveSeasonMedia reorders).
  const order = items;

  const controls = (m: SeasonMedia) => {
    const i = order.findIndex((x) => x.id === m.id);
    const label = m.caption || `item ${i + 1}`;
    return (
      <div className="mt-1.5 space-y-1.5">
        <input
          defaultValue={m.caption}
          maxLength={300}
          placeholder="Add a caption"
          aria-label={`Caption for ${label}`}
          onBlur={(e) => e.target.value.trim() !== m.caption && run(() => updateMediaCaption({ slug, id: m.id, caption: e.target.value }), true)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-full min-h-11 rounded-md border border-rule-strong bg-board-2 px-2 text-[14px] text-ink"
        />
        <div className="flex gap-1.5">
          <button type="button" className={iconBtn} disabled={pending || i === 0} aria-label={`Move ${label} up`} onClick={() => run(() => moveSeasonMedia({ slug, id: m.id, dir: -1 }), true)}>
            ↑
          </button>
          <button type="button" className={iconBtn} disabled={pending || i === order.length - 1} aria-label={`Move ${label} down`} onClick={() => run(() => moveSeasonMedia({ slug, id: m.id, dir: 1 }), true)}>
            ↓
          </button>
          <button
            type="button"
            className={`${iconBtn} ml-auto text-loss`}
            disabled={pending}
            aria-label={`Delete ${label}`}
            onClick={() => window.confirm(`Delete ${label}? This can't be undone.`) && run(() => deleteSeasonMedia({ slug, id: m.id }))}
          >
            🗑
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          if (!uploadsEnabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (uploadsEnabled) addFiles([...e.dataTransfer.files]);
        }}
        className={`panel-bare p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-dashed ${dragging ? "border-ice bg-board-3" : ""}`}
      >
        <button
          type="button"
          disabled={!uploadsEnabled}
          onClick={() => input.current?.click()}
          className="min-h-11 px-4 rounded-md border border-ice bg-ice text-board text-[14px] font-semibold disabled:opacity-50"
        >
          Add photos &amp; videos
        </button>
        <p className="text-[14px] text-ink-faint">
          {uploadsEnabled ? (
            <>
              <span className="hidden sm:inline">Or drop files here. </span>Photos, videos and PDFs; up to 20 MB (videos 200 MB).
            </>
          ) : (
            "Uploads are off: BLOB_READ_WRITE_TOKEN isn't set."
          )}
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept={PICKER_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.key} className="text-[14px]">
              <div className="flex justify-between gap-2">
                <span className="truncate text-ink">{u.name}</span>
                <span className={u.status === "error" ? "text-loss" : "text-ink-faint"}>
                  {u.status === "uploading" ? `${Math.round(u.pct)}%` : u.status === "saving" ? "Saving…" : u.status === "done" ? "Added" : u.error}
                </span>
              </div>
              <progress max={100} value={u.pct} className="w-full h-1.5" />
            </li>
          ))}
        </ul>
      )}

      {visual.length > 0 && <MediaGrid items={visual} seasonName={seasonName} tileExtra={(m) => controls(m)} />}
      <MediaFiles items={files} itemExtra={(m) => controls(m)} />
    </div>
  );
}
