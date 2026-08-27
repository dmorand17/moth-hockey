"use client";

import { useMemo, useState, useTransition } from "react";
import { PlayerCombobox } from "@/components/PlayerCombobox";
import { saveRosterChanges } from "../rosters/actions";

type Position = "forward" | "defense" | "goalie";

type RosterRow = {
  player_id: string;
  first_name: string;
  last_name: string;
  position: string;
  jersey_number: number | null;
  is_captain?: boolean;
};

type UnrosteredPlayer = {
  id: string;
  first_name: string;
  last_name: string;
};

const rowInputCls =
  "bg-board-3 border border-rule rounded px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ice";

export function RosterEditor({
  teamId,
  initialRows,
  unrosteredAll,
}: {
  teamId: string;
  initialRows: RosterRow[];
  unrosteredAll: UnrosteredPlayer[];
}) {
  const [rows, setRows] = useState<RosterRow[]>(initialRows);
  const [savedRows, setSavedRows] = useState<RosterRow[]>(initialRows);
  const [addPosition, setAddPosition] = useState<string>("forward");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Players available to add: global unrostered pool + any staged-for-removal
  // players from this team, minus any already in current rows.
  const available = useMemo(() => {
    const inRows = new Set(rows.map((r) => r.player_id));
    const readdable = savedRows
      .filter((r) => !inRows.has(r.player_id))
      .map((r) => ({ id: r.player_id, first_name: r.first_name, last_name: r.last_name }));
    return [...unrosteredAll.filter((p) => !inRows.has(p.id)), ...readdable].sort((a, b) =>
      a.last_name.localeCompare(b.last_name),
    );
  }, [rows, savedRows, unrosteredAll]);

  const [addPlayerId, setAddPlayerId] = useState(available[0]?.id ?? "");

  const changeCount = useMemo(() => {
    const savedIds = new Set(savedRows.map((r) => r.player_id));
    const rowIds = new Set(rows.map((r) => r.player_id));
    const additions = rows.filter((r) => !savedIds.has(r.player_id)).length;
    const removals = savedRows.filter((r) => !rowIds.has(r.player_id)).length;
    const updates = rows.filter((r) => {
      const orig = savedRows.find((o) => o.player_id === r.player_id);
      return orig && (orig.position !== r.position || orig.jersey_number !== r.jersey_number);
    }).length;
    return additions + removals + updates;
  }, [rows, savedRows]);

  const dirty = changeCount > 0;

  const updateRow = (player_id: string, field: "position" | "jersey_number", value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.player_id !== player_id) return r;
        if (field === "jersey_number") {
          const n = value.trim() === "" ? null : parseInt(value, 10);
          return { ...r, jersey_number: isNaN(n as number) ? null : n };
        }
        return { ...r, [field]: value };
      }),
    );
  };

  const removeRow = (player_id: string) => {
    setRows((prev) => prev.filter((r) => r.player_id !== player_id));
  };

  const addRow = () => {
    const player = available.find((p) => p.id === addPlayerId);
    if (!player) return;
    setRows((prev) => [
      ...prev,
      {
        player_id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        position: addPosition,
        jersey_number: null,
      },
    ]);
    const next = available.find((p) => p.id !== addPlayerId);
    setAddPlayerId(next?.id ?? "");
  };

  const handleSave = () => {
    const savedIds = new Set(savedRows.map((r) => r.player_id));
    const rowIds = new Set(rows.map((r) => r.player_id));
    const toAdd = rows.filter((r) => !savedIds.has(r.player_id));
    const toRemove = savedRows.filter((r) => !rowIds.has(r.player_id));
    const toUpdate = rows.filter((r) => {
      const orig = savedRows.find((o) => o.player_id === r.player_id);
      return orig && (orig.position !== r.position || orig.jersey_number !== r.jersey_number);
    });

    startTransition(async () => {
      const result = await saveRosterChanges({
        teamId,
        toAdd: toAdd.map((r) => ({ player_id: r.player_id, position: r.position as Position, jersey_number: r.jersey_number })),
        toRemove: toRemove.map((r) => ({ player_id: r.player_id })),
        toUpdate: toUpdate.map((r) => ({ player_id: r.player_id, position: r.position as Position, jersey_number: r.jersey_number })),
      });
      if (result.ok) {
        setSavedRows([...rows]);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  const handleDiscard = () => {
    setRows([...savedRows]);
    setError(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between min-h-[24px]">
        <h4 className="eyebrow text-[11px]">
          ROSTER · {rows.length} players
          {dirty && <span className="text-amber-400 ml-1">· {changeCount} pending</span>}
        </h4>
        {dirty && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={pending}
              className="eyebrow text-[10px] text-ink-faint hover:text-ink-dim disabled:opacity-50"
            >
              discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="px-2.5 py-1 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.1em] text-[11px] rounded transition-colors shrink-0 disabled:opacity-50"
            >
              {pending ? "SAVING…" : `SAVE ${changeCount}`}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-goal text-[12px]">{error}</p>}

      {rows.length > 0 && (
        <ul className="border border-rule rounded divide-y divide-rule/50">
          {rows.map((player) => {
            const isNew = !savedRows.find((r) => r.player_id === player.player_id);
            return (
              <li
                key={player.player_id}
                className={`flex items-center gap-2 px-3 py-1.5 ${isNew ? "bg-ice/5" : ""}`}
              >
                <span className="flex-1 text-ink text-[13px] truncate inline-flex items-center gap-1.5">
                  {player.is_captain && (
                    <span
                      title="Team captain"
                      className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-[#fbbf24] text-[#fbbf24] text-[9px] font-bold shrink-0"
                    >
                      C
                    </span>
                  )}
                  <span className="truncate">
                    {player.first_name} {player.last_name}
                  </span>
                  {isNew && <span className="eyebrow text-[9px] text-ice">NEW</span>}
                </span>
                <select
                  value={player.position}
                  onChange={(e) => updateRow(player.player_id, "position", e.target.value)}
                  className={rowInputCls}
                >
                  <option value="forward">Forward</option>
                  <option value="defense">Defense</option>
                  <option value="goalie">Goalie</option>
                </select>
                <label className="flex items-center gap-0.5">
                  <span className="eyebrow text-[10px] text-ink-faint">#</span>
                  <input
                    type="number"
                    value={player.jersey_number ?? ""}
                    onChange={(e) => updateRow(player.player_id, "jersey_number", e.target.value)}
                    min={0}
                    max={99}
                    placeholder="—"
                    className={`${rowInputCls} w-12`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(player.player_id)}
                  className="text-goal/50 hover:text-goal text-[13px] transition-colors px-1 leading-none"
                  aria-label="Remove player"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {available.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="flex-1 min-w-[160px]">
            <PlayerCombobox
              options={available.map((p) => ({
                value: p.id,
                label: `${p.last_name}, ${p.first_name}`,
              }))}
              value={addPlayerId}
              onChange={setAddPlayerId}
              placeholder="Search players…"
            />
          </div>
          <select
            value={addPosition}
            onChange={(e) => setAddPosition(e.target.value)}
            className="bg-board-3 border border-rule rounded px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ice"
          >
            <option value="forward">Forward</option>
            <option value="defense">Defense</option>
            <option value="goalie">Goalie</option>
          </select>
          <button
            type="button"
            onClick={addRow}
            disabled={!addPlayerId}
            className="px-2.5 py-1 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.1em] text-[11px] rounded transition-colors shrink-0 disabled:opacity-50"
          >
            ADD
          </button>
        </div>
      )}
    </div>
  );
}
