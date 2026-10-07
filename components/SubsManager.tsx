"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { SubControls, type Position } from "@/components/RosterCheckIn";
import { addGameSub, createGameSub, removeGameSub } from "@/app/games/[id]/actions";

export type GameSub = { id: string; name: string; position: Position };

const POS_SHORT: Record<Position, string> = { forward: "F", defense: "D", goalie: "G" };

// Captain/admin control for lining up subs before a game. Shares the search /
// "new sub" picker with the scorekeeper's check-in so both flows behave alike.
export function SubsManager({
  gameId,
  teamId,
  subs,
  addableSubs,
}: {
  gameId: string;
  teamId: string;
  subs: GameSub[];
  addableSubs: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handle = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const res = await fn();
        if (!res.ok) {
          toast.error(res.error);
          resolve(false);
        } else {
          router.refresh();
          resolve(true);
        }
      });
    });

  return (
    <div className="space-y-2 border-t border-rule pt-3">
      <div className="eyebrow text-ink-dim">Subs · {subs.length}</div>
      {subs.length > 0 && (
        <ul className="divide-y divide-rule">
          {subs.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <Link
                href={`/players/${s.id}`}
                className="flex-1 text-[14px] text-ink-dim hover:text-ink transition-colors truncate"
              >
                {s.name}
              </Link>
              <span className="chip text-[10px]" title={s.position}>
                SUB · {POS_SHORT[s.position]}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => handle(() => removeGameSub({ gameId, playerId: s.id }))}
                aria-label={`Remove ${s.name} as a sub`}
                className="min-w-[36px] min-h-[28px] px-2 eyebrow text-[10px] rounded border border-rule bg-board-3 text-ink-faint hover:border-goal hover:text-goal disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <SubControls
        addableSubs={addableSubs}
        onAddExistingSub={(playerId, _name, position) => {
          void handle(() => addGameSub({ gameId, teamId, playerId, position }));
        }}
        onCreateNewSub={(firstName, lastName, position) =>
          handle(() => createGameSub({ gameId, teamId, firstName, lastName, position }))
        }
      />
    </div>
  );
}

// Read-only list for everyone who can't manage the team.
export function SubsList({ subs }: { subs: GameSub[] }) {
  if (subs.length === 0) return null;
  return (
    <div>
      <div className="eyebrow text-ink-dim">Subs · {subs.length}</div>
      <ul className="mt-1 space-y-0.5">
        {subs.map((s) => (
          <li key={s.id} className="text-[14px] text-ink-dim">
            <Link href={`/players/${s.id}`} className="hover:text-ink transition-colors">
              {s.name}
            </Link>
            <span className="text-ink-faint"> · {POS_SHORT[s.position]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
