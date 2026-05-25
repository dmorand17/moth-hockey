"use client";

import { useEffect, useState } from "react";

// One-time, dismissible nudge for iOS Safari users to add the live scorekeeper
// to their home screen. Only shows when:
//   - userAgent looks like iOS Safari (not Chrome/Firefox iOS)
//   - the page is NOT already running standalone
//   - the user hasn't dismissed before (localStorage)
const STORAGE_KEY = "moth.installHintDismissed";

export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY) === "1") return;

    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    // Chrome/Firefox/Edge on iOS contain CriOS/FxiOS/EdgiOS — skip those, the
    // share-sheet flow only works in real Safari.
    const isInAppBrowser = /CriOS|FxiOS|EdgiOS/.test(ua);
    const isStandalone =
      // Safari iOS
      ("standalone" in window.navigator &&
        (window.navigator as Navigator & { standalone?: boolean }).standalone) ||
      // PWA spec
      window.matchMedia("(display-mode: standalone)").matches;

    if (isIOS && !isInAppBrowser && !isStandalone) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="panel-bare p-2 px-3 flex items-center gap-2 text-[12px] text-ink-dim">
      <span className="eyebrow text-[10px] text-ice shrink-0">Tip</span>
      <span className="flex-1 leading-snug">
        Add to home screen for full-screen scoring. Tap{" "}
        <span className="font-mono text-ink">⎙</span> then{" "}
        <span className="text-ink">Add to Home Screen</span>.
      </span>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(STORAGE_KEY, "1");
          setShow(false);
        }}
        aria-label="Dismiss tip"
        className="eyebrow text-[10px] text-ink-faint hover:text-ink min-h-[32px] px-2"
      >
        ✕
      </button>
    </div>
  );
}
