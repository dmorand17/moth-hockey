"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { updatePlayer, linkUserToPlayer, deletePlayer, mergePlayer } from "./actions";

export type Team = { id: string; name: string; color: string };

export type PlayerAccount = {
  user_id: string;
  email: string;
  role: string | null;
};

export type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  current_team: Team | null;
  jersey_number: number | null;
  position: "forward" | "defense" | "goalie" | null;
  account: PlayerAccount | null;
};

export type UnlinkedAccount = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string | null;
};

export type RoleOption = { value: string; label: string };

const PAGE_SIZE = 20;

const POSITION_LABEL: Record<string, string> = {
  forward: "Forward",
  defense: "Defense",
  goalie: "Goalie",
};

const rowInputCls =
  "bg-board-3 border border-rule rounded px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ice";

type LinkFilter = "all" | "linked" | "unlinked";

export function PlayerFilters({
  players,
  teams,
}: {
  players: PlayerRow[];
  teams: Team[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [expanded, setExpanded] = useState(false);
  const [actionPending, startAction] = useTransition();
  const [playerErrors, setPlayerErrors] = useState<Map<string, string>>(new Map());
  const [mergeTargets, setMergeTargets] = useState<Map<string, string>>(new Map());

  const setPlayerError = (playerId: string, msg: string | null) => {
    setPlayerErrors((prev) => {
      const next = new Map(prev);
      if (msg === null) next.delete(playerId);
      else next.set(playerId, msg);
      return next;
    });
  };

  const handleDelete = (player: PlayerRow) => {
    if (!confirm(`Delete ${player.first_name} ${player.last_name}? This cannot be undone.`)) return;
    startAction(async () => {
      const result = await deletePlayer({ playerId: player.id });
      if (result.ok) {
        toast.success(result.message ?? "Player deleted.");
        router.refresh();
      } else {
        toast.error(result.error);
        setPlayerError(player.id, result.error);
      }
    });
  };

  const handleMerge = (player: PlayerRow) => {
    const keepId = mergeTargets.get(player.id) ?? "";
    if (!keepId) return;
    const keepPlayer = players.find((p) => p.id === keepId);
    if (
      !confirm(
        `Merge ${player.first_name} ${player.last_name} INTO ${keepPlayer?.first_name} ${keepPlayer?.last_name}?\n\nAll game data will be reassigned to the canonical player and the duplicate will be deleted. This cannot be undone.`,
      )
    )
      return;
    startAction(async () => {
      const result = await mergePlayer({ keepId, duplicateId: player.id });
      if (result.ok) {
        toast.success(result.message ?? "Players merged.");
        router.refresh();
      } else {
        toast.error(result.error);
        setPlayerError(player.id, result.error);
      }
    });
  };

  const q = search.trim().toLowerCase();
  const filtered = players.filter((p) => {
    if (q) {
      const full = `${p.first_name} ${p.last_name}`.toLowerCase();
      if (!full.includes(q)) return false;
    }
    if (teamFilter === "unrostered" && p.current_team) return false;
    if (teamFilter && teamFilter !== "unrostered" && p.current_team?.id !== teamFilter)
      return false;
    if (linkFilter === "linked" && !p.account) return false;
    if (linkFilter === "unlinked" && p.account) return false;
    return true;
  });

  const visible = expanded ? filtered : filtered.slice(0, PAGE_SIZE);
  const hasMore = filtered.length > PAGE_SIZE;

  const linkedCount = players.filter((p) => p.account).length;
  const notLinkedCount = players.length - linkedCount;

  const resetPage = () => setExpanded(false);
  const handleSearch = (v: string) => {
    setSearch(v);
    resetPage();
  };
  const handleTeam = (v: string) => {
    setTeamFilter(v);
    resetPage();
  };
  const handleLink = (v: LinkFilter) => {
    setLinkFilter(v);
    resetPage();
  };

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-[180px]">
          <span className="eyebrow">Search</span>
          <div className="relative mt-1">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search players…"
              className="w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => handleSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </label>

        <label className="block min-w-[150px]">
          <span className="eyebrow">Team</span>
          <select
            value={teamFilter}
            onChange={(e) => handleTeam(e.target.value)}
            className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="unrostered">Unrostered only</option>
          </select>
        </label>

        <label className="block min-w-[140px]">
          <span className="eyebrow">Account</span>
          <select
            value={linkFilter}
            onChange={(e) => handleLink(e.target.value as LinkFilter)}
            className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
          >
            <option value="all">All</option>
            <option value="linked">Linked</option>
            <option value="unlinked">Not linked</option>
          </select>
        </label>
      </div>

      {/* Counts */}
      <p className="eyebrow text-ink-faint">
        {filtered.length} shown · {players.length} total · {linkedCount} linked ·{" "}
        {notLinkedCount} not linked
      </p>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-ink-dim text-sm panel-bare p-4">
          No players match the current filters.
        </p>
      ) : (
        <ul className="border border-rule rounded divide-y divide-rule/50">
          {visible.map((player) => (
            <li key={player.id}>
              <details className="group">
                <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none select-none hover:bg-board-3 transition-colors">
                  <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
                    ▶
                  </span>
                  <span className="text-ink text-[13px] truncate flex-1 min-w-0">
                    {player.last_name}, {player.first_name}
                  </span>

                  {player.current_team ? (
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span
                        className="h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ background: player.current_team.color }}
                      />
                      <span className="text-ink-faint text-[11px] hidden sm:inline">
                        {player.current_team.name}
                      </span>
                      {player.jersey_number != null && (
                        <span className="font-mono text-[11px] text-ink-faint">
                          #{player.jersey_number}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-sm border border-rule shrink-0" />
                  )}

                  {player.account ? (
                    <span className="chip chip-linked text-[9px] px-1.5 py-0.5 shrink-0">
                      LINKED
                    </span>
                  ) : (
                    <span className="chip chip-live text-[9px] px-1.5 py-0.5 shrink-0">
                      NOT LINKED
                    </span>
                  )}
                </summary>

                <div className="border-t border-rule px-3 py-3 space-y-4">
                  {/* Name */}
                  <ActionForm
                    action={updatePlayer}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="id" value={player.id} />
                    <label className="block flex-1 min-w-[120px]">
                      <span className="eyebrow">First name</span>
                      <input
                        type="text"
                        name="first_name"
                        required
                        defaultValue={player.first_name}
                        className={`mt-1 w-full ${rowInputCls}`}
                      />
                    </label>
                    <label className="block flex-1 min-w-[120px]">
                      <span className="eyebrow">Last name</span>
                      <input
                        type="text"
                        name="last_name"
                        required
                        defaultValue={player.last_name}
                        className={`mt-1 w-full ${rowInputCls}`}
                      />
                    </label>
                    <SubmitButton className="px-2.5 py-1 min-h-8 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.1em] text-[11px] rounded transition-colors shrink-0">
                      SAVE
                    </SubmitButton>
                  </ActionForm>

                  {/* Account — link/role assignment lives in the Needs Linking
                      section (link + role) and on the Users page (role). Here we
                      only surface the current link and an unlink escape hatch. */}
                  <div className="space-y-2">
                    <span className="eyebrow text-ink-faint">Account</span>
                    {player.account ? (
                      <div className="space-y-2">
                        <div className="font-mono text-[11px] text-ink-dim truncate">
                          {player.account.email}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <ActionForm action={linkUserToPlayer}>
                            <input
                              type="hidden"
                              name="user_id"
                              value={player.account.user_id}
                            />
                            <input type="hidden" name="player_id" value="" />
                            <SubmitButton className="px-2.5 py-1 min-h-8 text-goal border border-goal/40 hover:bg-goal/10 font-display tracking-[0.1em] text-[11px] rounded transition-colors">
                              UNLINK
                            </SubmitButton>
                          </ActionForm>
                          <a
                            href={`/admin/users#user-${player.account.user_id}`}
                            className="eyebrow hover:text-ink transition-colors"
                          >
                            Manage role on Users →
                          </a>
                        </div>
                      </div>
                    ) : (
                      <p className="text-ink-faint text-[12px]">
                        Not linked — link accounts in the Needs Linking section above.
                      </p>
                    )}
                  </div>

                  {/* Roster (read-only) + links */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[12px] text-ink-dim flex items-center gap-1.5 min-w-0">
                      {player.current_team ? (
                        <>
                          <span
                            className="h-2.5 w-2.5 rounded-sm shrink-0"
                            style={{ background: player.current_team.color }}
                          />
                          <span className="truncate">
                            {player.current_team.name}
                            {player.position
                              ? ` · ${POSITION_LABEL[player.position]}`
                              : ""}
                            {player.jersey_number != null
                              ? ` · #${player.jersey_number}`
                              : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-faint">Not on a roster</span>
                      )}
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <a
                        href="/admin/seasons"
                        className="eyebrow hover:text-ink transition-colors"
                      >
                        Manage on Seasons →
                      </a>
                      <a
                        href={`/players/${player.id}`}
                        className="eyebrow hover:text-ink transition-colors"
                      >
                        View profile →
                      </a>
                    </span>
                  </div>

                  {/* Per-player action error */}
                  {playerErrors.get(player.id) && (
                    <p className="text-goal text-[12px]">{playerErrors.get(player.id)}</p>
                  )}

                  {/* Danger zone — collapsed by default (rarely used) */}
                  <details className="group/dz border-t border-rule/50 pt-3">
                    <summary className="flex items-center gap-1.5 cursor-pointer list-none select-none eyebrow text-ink-faint hover:text-goal transition-colors min-h-9">
                      <span className="text-[10px] transition-transform duration-150 group-open/dz:rotate-90 inline-block">
                        ▶
                      </span>
                      Danger zone
                      <span className="text-ink-faint/60 normal-case tracking-normal ml-1">
                        — delete or merge
                      </span>
                    </summary>

                    <div className="mt-3 space-y-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(player)}
                        disabled={actionPending}
                        className="block px-2.5 py-1 min-h-8 text-goal border border-goal/40 hover:bg-goal/10 font-display tracking-[0.1em] text-[11px] rounded transition-colors disabled:opacity-50"
                      >
                        DELETE PLAYER
                      </button>

                      <div className="flex flex-wrap items-end gap-2">
                        <label className="block flex-1 min-w-[200px]">
                          <span className="eyebrow">Merge into</span>
                          <select
                            value={mergeTargets.get(player.id) ?? ""}
                            onChange={(e) =>
                              setMergeTargets((prev) => new Map(prev).set(player.id, e.target.value))
                            }
                            className={`mt-1 w-full ${rowInputCls}`}
                          >
                            <option value="">— select canonical player —</option>
                            {players
                              .filter((p) => p.id !== player.id)
                              .sort((a, b) => a.last_name.localeCompare(b.last_name))
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.last_name}, {p.first_name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleMerge(player)}
                          disabled={actionPending || !mergeTargets.get(player.id)}
                          className="px-2.5 py-1 min-h-8 text-goal border border-goal/40 hover:bg-goal/10 font-display tracking-[0.1em] text-[11px] rounded transition-colors disabled:opacity-50"
                        >
                          MERGE
                        </button>
                      </div>
                    </div>
                  </details>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="eyebrow hover:text-ink transition-colors min-h-11 px-2 -mx-2"
        >
          {expanded ? "Show fewer" : `Show all ${filtered.length} players`}
        </button>
      )}
    </div>
  );
}
