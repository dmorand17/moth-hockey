"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAvailability } from "@/app/account/actions";

export function CheckInToggle({
  gameId,
  status,
}: {
  gameId: string;
  status: "in" | "out" | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const set = (choice: "in" | "out") => {
    setError(null);
    const target = status === choice ? null : choice; // re-tap active = clear
    startTransition(async () => {
      const res = await setAvailability({ gameId, status: target });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => set("in")}
          disabled={pending}
          aria-pressed={status === "in"}
          className={`min-h-11 font-display tracking-[0.14em] text-[14px] rounded border transition-colors disabled:opacity-50 ${
            status === "in"
              ? "bg-goal text-board border-goal"
              : "bg-board-3 text-ink-dim border-rule hover:border-goal hover:text-ink"
          }`}
        >
          IN
        </button>
        <button
          type="button"
          onClick={() => set("out")}
          disabled={pending}
          aria-pressed={status === "out"}
          className={`min-h-11 font-display tracking-[0.14em] text-[14px] rounded border transition-colors disabled:opacity-50 ${
            status === "out"
              ? "bg-ice text-board border-ice"
              : "bg-board-3 text-ink-dim border-rule hover:border-ice hover:text-ink"
          }`}
        >
          OUT
        </button>
      </div>
      {error && (
        <p role="alert" className="text-goal text-[12px]">
          {error}
        </p>
      )}
      <p className="eyebrow text-[10px] text-ink-faint">
        {status === "in"
          ? "You're in. Tap IN again to clear."
          : status === "out"
            ? "You're out. Tap OUT again to clear."
            : "No response yet."}
      </p>
    </div>
  );
}
