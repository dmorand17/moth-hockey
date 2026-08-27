"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlayerCombobox } from "@/components/PlayerCombobox";
import { linkAccounts } from "./actions";

type ActionRole = "admin" | "scorekeeper" | "team_captain" | "player";
type Account = { user_id: string; email: string; full_name: string | null; role: string | null };
type PlayerOption = { id: string; name: string };
type RoleOption = { value: string; label: string };

// Set each account's player + role, then save them all at once (no per-row
// save). Parent should key this on the account id set so it remounts after a
// successful save (linked accounts drop off the list).
export function NeedsLinkingEditor({
  accounts,
  players,
  roleOptions,
}: {
  accounts: Account[];
  players: PlayerOption[];
  roleOptions: RoleOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { playerId: string; role: string }>>(() =>
    Object.fromEntries(accounts.map((a) => [a.user_id, { playerId: "", role: a.role ?? "player" }])),
  );

  const setRow = (userId: string, patch: Partial<{ playerId: string; role: string }>) =>
    setDraft((d) => ({ ...d, [userId]: { ...d[userId], ...patch } }));

  // A player picked in one row can't be picked in another.
  const chosen = useMemo(
    () => new Set(Object.values(draft).map((r) => r.playerId).filter(Boolean)),
    [draft],
  );

  const changes = accounts.filter((a) => {
    const d = draft[a.user_id];
    return d && (d.playerId || d.role !== (a.role ?? "player"));
  });

  const saveAll = () => {
    if (changes.length === 0) return;
    setError(null);
    const updates = changes.map((a) => ({
      user_id: a.user_id,
      player_id: draft[a.user_id].playerId || null,
      role: draft[a.user_id].role as ActionRole,
    }));
    startTransition(async () => {
      const res = await linkAccounts(updates);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-ink-dim text-[12px]">
          Pick a player (and role) for each, then save them together.
        </p>
        <button
          type="button"
          onClick={saveAll}
          disabled={changes.length === 0 || pending}
          className="shrink-0 min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? "SAVING…" : `SAVE ALL${changes.length ? ` (${changes.length})` : ""}`}
        </button>
      </div>

      {error && <p role="alert" className="text-goal text-sm">{error}</p>}

      <ul className="border border-goal/30 rounded divide-y divide-rule/50">
        {accounts.map((acct) => {
          const d = draft[acct.user_id] ?? { playerId: "", role: acct.role ?? "player" };
          const isCaptain = acct.role === "team_captain";
          const rowChanged = d.playerId || d.role !== (acct.role ?? "player");
          const options = players
            .filter((p) => !chosen.has(p.id) || p.id === d.playerId)
            .map((p) => ({ value: p.id, label: p.name }));
          return (
            <li
              key={acct.user_id}
              className={`px-3 py-3 flex flex-col sm:flex-row sm:items-end gap-3 ${rowChanged ? "bg-ice/5" : ""}`}
            >
              <div className="min-w-0 sm:w-52 shrink-0">
                <span className="block text-ink text-[13px] truncate">
                  {acct.full_name || acct.email}
                </span>
                {acct.full_name && (
                  <span className="block font-mono text-[11px] text-ink-faint truncate">
                    {acct.email}
                  </span>
                )}
              </div>

              <label className="block shrink-0">
                <span className="eyebrow">Role</span>
                {isCaptain ? (
                  <div className="mt-1 text-[12px] text-ink-dim min-h-[38px] flex items-center">
                    Team Captain <span className="text-ink-faint ml-1">(via Teams)</span>
                  </div>
                ) : (
                  <select
                    value={d.role}
                    onChange={(e) => setRow(acct.user_id, { role: e.target.value })}
                    className="mt-1 bg-board-3 border border-rule rounded px-2 py-1.5 text-[12px] text-ink focus:outline-none focus:border-ice"
                  >
                    {roleOptions.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <label className="block flex-1 min-w-0">
                <span className="eyebrow">Link to player</span>
                <div className="mt-1">
                  <PlayerCombobox
                    options={options}
                    value={d.playerId}
                    onChange={(v) => setRow(acct.user_id, { playerId: v })}
                    allowClear
                    placeholder="Search players…"
                  />
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
