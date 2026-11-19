import { formatBytes } from "@/lib/media";
import type { SeasonMedia } from "@/lib/queries";
import type { ReactNode } from "react";

const fileName = (m: SeasonMedia) => decodeURIComponent(m.pathname.split("/").pop() ?? "file");

// PDFs and files browsers can't show inline (e.g. HEIC): icon, name, size, download.
export function MediaFiles({ items, itemExtra }: { items: SeasonMedia[]; itemExtra?: (m: SeasonMedia) => ReactNode }) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y divide-rule panel-bare">
      {items.map((m) => (
        <li key={m.id} className="px-3 py-2">
          <a href={m.url} download className="flex items-center gap-3 min-h-11 text-ink hover:text-ice">
            <span aria-hidden className="h-9 w-9 shrink-0 rounded-md border border-rule bg-board-3 flex items-center justify-center text-[12px] font-bold text-ink-dim">
              {m.contentType === "application/pdf" ? "PDF" : "FILE"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{m.caption || fileName(m)}</span>
              <span className="block text-[13px] text-ink-faint">{formatBytes(m.sizeBytes)} · Download</span>
            </span>
          </a>
          {itemExtra?.(m)}
        </li>
      ))}
    </ul>
  );
}
