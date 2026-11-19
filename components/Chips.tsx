import { formatTime } from "@/lib/format";

export type GameResult = "W" | "L" | "OTL";

const RESULT: Record<GameResult, { cls: string; label: string }> = {
  W: { cls: "chip-win", label: "Win" },
  L: { cls: "chip-loss", label: "Loss" },
  OTL: { cls: "chip-otl", label: "Overtime/shootout loss" },
};

// W / L / OTL — letter + color, with a full-word accessible name.
export function ResultChip({ result }: { result: GameResult }) {
  const r = RESULT[result];
  return (
    <span className={`chip ${r.cls} justify-center min-w-[2.5rem]`} title={r.label}>
      <span aria-hidden>{result}</span>
      <span className="sr-only">{r.label}</span>
    </span>
  );
}

type Status = "scheduled" | "live" | "final";

// Game status: Final / Final·OT / Final·SO, Live, or the puck-drop time.
export function StatusChip({
  status,
  decidedIn,
  scheduledAt,
  liveDetail,
}: {
  status: Status;
  decidedIn?: "regulation" | "ot" | "shootout" | string | null;
  scheduledAt?: string;
  liveDetail?: string;
}) {
  if (status === "live") {
    return (
      <span className="chip chip-live">
        <span className="live-dot" aria-hidden /> Live{liveDetail ? ` · ${liveDetail}` : ""}
      </span>
    );
  }
  if (status === "final") {
    const suffix = decidedIn === "ot" ? " · OT" : decidedIn === "shootout" ? " · SO" : "";
    return <span className="chip">Final{suffix}</span>;
  }
  return <span className="chip text-ice!">{scheduledAt ? formatTime(scheduledAt) : "Upcoming"}</span>;
}
