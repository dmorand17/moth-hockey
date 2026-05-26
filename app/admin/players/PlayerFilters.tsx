"use client";

import { useState, useTransition } from "react";
import { updatePlayer, updateUserRole, linkUserToPlayer } from "./actions";

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
  unlinkedAccounts,
  roleOptions,
}: {
  players: PlayerRow[];
  teams: Team[];
  unlinkedAccounts: UnlinkedAccount[];
  roleOptions: RoleOption[];
}) {
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();

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

  const submit = () => startTransition(() => {});

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
                  <form
                    action={updatePlayer}
                    onSubmit={submit}
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
                    <button
                      type="submit"
                      className="px-2.5 py-1 min-h-8 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.1em] text-[11px] rounded transition-colors shrink-0"
                    >
                      SAVE
                    </button>
                  </form>

                  {/* Account */}
                  <div className="space-y-2">
                    <span className="eyebrow text-ink-faint">Account</span>
                    {player.account ? (
                      <div className="space-y-2">
                        <div className="font-mono text-[11px] text-ink-dim truncate">
                          {player.account.email}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <form
                            action={updateUserRole}
                            onSubmit={submit}
                            className="flex items-end gap-2"
                          >
                            <input
                              type="hidden"
                              name="user_id"
                              value={player.account.user_id}
                            />
                            <label className="block">
                              <span className="eyebrow">Role</span>
                              <select
                                name="role"
                                defaultValue={player.account.role ?? "player"}
                                className={`mt-1 ${rowInputCls}`}
                              >
                                {player.account.role === "team_captain" && (
                                  <option value="team_captain" disabled>
                                    Team Captain (via Teams)
                                  </option>
                                )}
                                {roleOptions.map((r) => (
                                  <option key={r.value} value={r.value}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="submit"
                              className="px-2.5 py-1 min-h-8 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.1em] text-[11px] rounded transition-colors"
                            >
                              SAVE
                            </button>
                          </form>

                          <form action={linkUserToPlayer} onSubmit={submit}>
                            <input
                              type="hidden"
                              name="user_id"
                              value={player.account.user_id}
                            />
                            <input type="hidden" name="player_id" value="" />
                            <button
                              type="submit"
                              className="px-2.5 py-1 min-h-8 text-goal/70 hover:text-goal border border-transparent hover:border-goal/30 font-display tracking-[0.1em] text-[11px] rounded transition-colors"
                            >
                              UNLINK
                            </button>
                          </form>
                        </div>
                      </div>
                    ) : unlinkedAccounts.length > 0 ? (
                      <form
                        action={linkUserToPlayer}
                        onSubmit={submit}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="player_id" value={player.id} />
                        <label className="block flex-1 min-w-[180px]">
                          <span className="eyebrow">Link account</span>
                          <select
                            name="user_id"
                            defaultValue=""
                            required
                            className={`mt-1 w-full ${rowInputCls}`}
                          >
                            <option value="" disabled>
                              — select signup —
                            </option>
                            {unlinkedAccounts.map((a) => (
                              <option key={a.user_id} value={a.user_id}>
                                {a.full_name ? `${a.full_name} · ` : ""}
                                {a.email}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="submit"
                          className="px-2.5 py-1 min-h-8 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.1em] text-[11px] rounded transition-colors shrink-0"
                        >
                          LINK
                        </button>
                      </form>
                    ) : (
                      <p className="text-ink-faint text-[12px]">
                        No unlinked signups available.
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
                        href="/admin/rosters"
                        className="eyebrow hover:text-ink transition-colors"
                      >
                        Manage on Rosters →
                      </a>
                      <a
                        href={`/players/${player.id}`}
                        className="eyebrow hover:text-ink transition-colors"
                      >
                        View profile →
                      </a>
                    </span>
                  </div>
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
