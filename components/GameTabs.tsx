"use client";

import { useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";

export type GameTab = { id: string; label: string; content: ReactNode };

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = () => window.location.hash.slice(1);
const serverHash = () => "";

// WAI-ARIA tabs (automatic activation). The active tab lives in the URL hash
// (#box-score) so links and refresh keep it; every panel is server-rendered
// and inactive ones are only hidden, so content stays crawlable.
export function GameTabs({ tabs, label }: { tabs: GameTab[]; label: string }) {
  const hash = useSyncExternalStore(subscribe, readHash, serverHash);
  const active = tabs.some((t) => t.id === hash) ? hash : tabs[0].id;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (id: string) => {
    // replaceState doesn't scroll or add history entries; tell the store.
    history.replaceState(null, "", `#${id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    select(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div className="sticky top-[var(--header-h)] z-[4] -mx-4 sm:mx-0 bg-board/95 backdrop-blur-sm border-b border-rule">
        <div role="tablist" aria-label={label} className="flex overflow-x-auto px-4 sm:px-0">
          {tabs.map((t, i) => {
            const selected = t.id === active;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(t.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={`relative shrink-0 min-h-[48px] px-4 text-[15px] font-semibold whitespace-nowrap transition-colors ${
                  selected
                    ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:bg-goal"
                    : "text-ink-dim hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          tabIndex={0}
          hidden={t.id !== active}
          className="pt-6 space-y-6 focus-visible:outline-offset-4"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
