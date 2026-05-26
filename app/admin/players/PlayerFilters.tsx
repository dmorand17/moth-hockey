"use client";

import { useState, useTransition } from "react";
import { updatePlayer } from "./actions";

export type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  user_id: string | null;
  current_team: { id: string; name: string; color: string } | null;
  jersey_number: number | null;
};

export type Team = { id: string; name: string; color: string };

const PAGE_SIZE = 20;

export function PlayerFilters({
  players,
  teams,
}: {
  players: PlayerRow[];
  teams: Team[];
}) {
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();

  const q = search.trim().toLowerCase();
  const filtered = players.filter((p) => {
    if (q) {
      const full = `${p.first_name} ${p.last_name}`.toLowerCase();
      if (!full.includes(q)) return false;
    }
    if (teamFilter === "unrostered") return !p.current_team;
    if (teamFilter) return p.current_team?.id === teamFilter;
    return true;
  });

  const visible = expanded ? filtered : filtered.slice(0, PAGE_SIZE);
  const hasMore = filtered.length > PAGE_SIZE;

  // Reset expanded when filters change
  const handleSearch = (v: string) => {
    setSearch(v);
    setExpanded(false);
  };
  const handleTeam = (v: string) => {
    setTeamFilter(v);
    setExpanded(false);
  };

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-[200px]">
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

        <label className="block min-w-[180px]">
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

        <div className="pb-1">
          <span className="eyebrow">
            {filtered.length}{" "}
            {filtered.length === 1 ? "player" : "players"}
          </span>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-ink-dim text-sm panel-bare p-4">
          No players match the current filters.
        </p>
      ) : (
        <ul className="border border-rule rounded divide-y divide-rule/50">
          {visible.map((player) => (
            <li key={player.id} className="flex items-center gap-2 px-3 py-1.5">
              <form
                action={updatePlayer}
                onSubmit={() => startTransition(() => {})}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <input type="hidden" name="id" value={player.id} />
                <input
                  type="text"
                  name="first_name"
                  required
                  key={player.id + "-first"}
                  defaultValue={player.first_name}
                  placeholder="First"
                  className="bg-board-3 border border-rule rounded px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ice w-24 sm:w-32 shrink-0"
                />
                <input
                  type="text"
                  name="last_name"
                  required
                  key={player.id + "-last"}
                  defaultValue={player.last_name}
                  placeholder="Last"
                  className="bg-board-3 border border-rule rounded px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ice w-24 sm:w-32 shrink-0"
                />
                <span className="flex items-center gap-2 ml-auto shrink-0">
                  {player.current_team ? (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-sm shrink-0"
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
                    <span className="eyebrow text-ink-faint text-[10px] hidden sm:inline">
                      Unrostered
                    </span>
                  )}
                  {player.user_id ? (
                    <a
                      href={`/admin/users#${player.user_id}`}
                      className="chip chip-linked text-[9px] px-1.5 py-0.5 hover:opacity-80 transition-opacity shrink-0"
                    >
                      LINKED
                    </a>
                  ) : (
                    <span className="chip chip-live text-[9px] px-1.5 py-0.5 shrink-0">
                      NOT LINKED
                    </span>
                  )}
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.1em] text-[11px] rounded transition-colors shrink-0"
                  >
                    SAVE
                  </button>
                </span>
              </form>
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
          {expanded
            ? "Show fewer"
            : `Show all ${filtered.length} players`}
        </button>
      )}
    </div>
  );
}
