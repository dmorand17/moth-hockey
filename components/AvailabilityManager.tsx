"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { TeamBadge } from "@/components/TeamBadge";
import { setPlayerAvailability } from "@/app/games/[id]/actions";

export type ManagedPlayer = {
  id: string;
  name: string;
  jersey: number | null;
  status: "in" | "out" | null;
};

type Team = { id: string; name: string; slug: string; color: string };

export function AvailabilityManager({
  gameId,
  team,
  players,
}: {
  gameId: string;
  team: Team;
  players: ManagedPlayer[];
}) {
  const inCount = players.filter((p) => p.status === "in").length;
  const outCount = players.filter((p) => p.status === "out").length;

  return (
    <div
      className="panel p-4 space-y-3"
      style={{ borderLeftColor: team.color, borderLeftWidth: 3, borderLeftStyle: "solid" }}
    >
      <div className="flex items-center justify-between gap-2">
        <TeamBadge name={team.name} slug={team.slug} color={team.color} size="sm" />
        <span className="eyebrow text-ink-faint">
          {inCount} in · {outCount} out
        </span>
      </div>
      {players.length === 0 ? (
        <p className="text-ink-faint text-[13px]">No roster set for this season.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {players.map((p) => (
            <PlayerRow key={p.id} gameId={gameId} player={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlayerRow({ gameId, player }: { gameId: string; player: ManagedPlayer }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const set = (choice: "in" | "out") => {
    const next = player.status === choice ? null : choice;
    startTransition(async () => {
      const res = await setPlayerAvailability({ gameId, playerId: player.id, status: next });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <li className="flex items-center gap-3 py-2">
      <Link
        href={`/players/${player.id}`}
        className="flex-1 text-[14px] text-ink-dim hover:text-ink transition-colors truncate"
      >
        {player.name}
        {player.jersey != null ? (
          <span className="text-ink-faint"> · #{player.jersey}</span>
        ) : null}
      </Link>
      <div className="flex gap-1 shrink-0">
        <button
          type="button"
          onClick={() => set("in")}
          disabled={pending}
          aria-pressed={player.status === "in"}
          className={`min-w-[36px] min-h-[28px] px-2 eyebrow text-[10px] rounded border transition-colors disabled:opacity-50 ${
            player.status === "in"
              ? "bg-goal text-board border-goal"
              : "bg-board-3 text-ink-faint border-rule hover:border-goal hover:text-ink"
          }`}
        >
          IN
        </button>
        <button
          type="button"
          onClick={() => set("out")}
          disabled={pending}
          aria-pressed={player.status === "out"}
          className={`min-w-[36px] min-h-[28px] px-2 eyebrow text-[10px] rounded border transition-colors disabled:opacity-50 ${
            player.status === "out"
              ? "bg-ice text-board border-ice"
              : "bg-board-3 text-ink-faint border-rule hover:border-ice hover:text-ink"
          }`}
        >
          OUT
        </button>
      </div>
    </li>
  );
}
