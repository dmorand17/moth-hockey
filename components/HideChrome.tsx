"use client";

import { useEffect } from "react";

// Hides global chrome and applies the immersive theme while mounted.
// Used by /score/[gameId] when status='live' so refs see one screen.
export function HideChrome() {
  useEffect(() => {
    document.body.classList.add("chrome-off");

    // Flip iOS Safari's address bar / Android Chrome's top chrome to match
    // the scoreboard panel, then restore on unmount.
    const meta = document.querySelector(
      'meta[name="theme-color"]',
    ) as HTMLMetaElement | null;
    const previous = meta?.getAttribute("content") ?? null;
    if (meta) meta.setAttribute("content", "#07090c");

    return () => {
      document.body.classList.remove("chrome-off");
      if (meta && previous !== null) meta.setAttribute("content", previous);
    };
  }, []);
  return null;
}
