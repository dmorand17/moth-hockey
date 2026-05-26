import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import { addToRoster, updateRosterEntry, removeFromRoster } from "./actions";

type SearchParams = Promise<{ saved?: string; error?: string }>;

const FLASH_MESSAGES: Record<string, string> = {
  added: "Player added to roster.",
  updated: "Roster entry updated.",
  removed: "Player removed from roster.",
};

type RosterPlayer = {
  player_id: string;
  first_name: string;
  last_name: string;
  position: string;
  jersey_number: number | null;
};

type TeamRow = { id: string; name: string; color: string };

const inputCls =
  "mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice";

export default async function AdminRostersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();

  const params = await searchParams;

  const [{ data: teams }, { data: rosterRows }, { data: allPlayers }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, name, color")
        .eq("season_id", season.id)
        .order("name"),
      supabase
        .from("team_players")
        .select(
          "team_id, player_id, position, jersey_number, player:player_id(id, first_name, last_name)",
        )
        .eq("season_id", season.id),
      supabase
        .from("players")
        .select("id, first_name, last_name")
        .order("last_name")
        .order("first_name"),
    ]);

  // Group roster entries by team
  const rosteredIds = new Set(rosterRows?.map((r) => r.player_id) ?? []);

  const unrostered = (allPlayers ?? []).filter((p) => !rosteredIds.has(p.id));

  const teamRosters = new Map<string, RosterPlayer[]>();
  for (const t of teams ?? []) teamRosters.set(t.id, []);

  for (const row of rosterRows ?? []) {
    const list = teamRosters.get(row.team_id);
    if (!list) continue;
    const p = row.player as {
      id: string;
      first_name: string;
      last_name: string;
    } | null;
    if (!p) continue;
    list.push({
      player_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      position: row.position,
      jersey_number: row.jersey_number,
    });
  }

  for (const players of teamRosters.values()) {
    players.sort((a, b) => {
      if (a.jersey_number != null && b.jersey_number != null)
        return a.jersey_number - b.jersey_number;
      if (a.jersey_number != null) return -1;
      if (b.jersey_number != null) return 1;
      return a.last_name.localeCompare(b.last_name);
    });
  }

  return (
    <div className="space-y-8">
      {params.saved && (
        <p role="status" className="text-ice text-sm">
          {FLASH_MESSAGES[params.saved] ?? "Saved."}
        </p>
      )}
      {params.error && (
        <p role="alert" className="text-goal text-sm">
          {params.error}
        </p>
      )}

      <header className="flex items-baseline gap-3">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink">
          ROSTERS
        </h2>
        <span className="eyebrow">{season.name}</span>
        {unrostered.length > 0 && (
          <span className="eyebrow text-ink-faint">
            · {unrostered.length} unrostered
          </span>
        )}
      </header>

      {(teams ?? []).map((team: TeamRow) => {
        const players = teamRosters.get(team.id) ?? [];
        return (
          <section key={team.id} className="space-y-3">
            <header className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm shrink-0"
                style={{ background: team.color }}
              />
              <h3 className="font-display text-lg tracking-[0.04em] text-ink">
                {team.name.toUpperCase()}
              </h3>
              <span className="eyebrow">{players.length} players</span>
            </header>

            {players.length > 0 && (
              <ul className="space-y-2">
                {players.map((player) => (
                  <li key={player.player_id} className="panel p-3">
                    <form
                      action={updateRosterEntry}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <input type="hidden" name="team_id" value={team.id} />
                      <input
                        type="hidden"
                        name="player_id"
                        value={player.player_id}
                      />

                      <span className="flex-1 min-w-[160px] text-ink self-center pb-1">
                        {player.first_name} {player.last_name}
                      </span>

                      <label className="block">
                        <span className="eyebrow">Position</span>
                        <select
                          name="position"
                          key={player.player_id + "-pos"}
                          defaultValue={player.position}
                          className={inputCls}
                        >
                          <option value="forward">Forward</option>
                          <option value="defense">Defense</option>
                          <option value="goalie">Goalie</option>
                        </select>
                      </label>

                      <label className="block w-24">
                        <span className="eyebrow">Jersey #</span>
                        <input
                          type="number"
                          name="jersey_number"
                          key={player.player_id + "-jersey"}
                          defaultValue={player.jersey_number ?? ""}
                          min={0}
                          max={99}
                          placeholder="—"
                          className={inputCls}
                        />
                      </label>

                      <div className="flex gap-2 items-center shrink-0 pb-1">
                        <button
                          type="submit"
                          className="min-h-11 px-4 bg-board-3 hover:bg-rule border border-rule text-ink-dim hover:text-ink font-display tracking-[0.14em] text-[13px] rounded transition-colors"
                        >
                          SAVE
                        </button>
                        <RemoveButton
                          teamId={team.id}
                          playerId={player.player_id}
                        />
                      </div>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {players.length === 0 && (
              <p className="text-ink-dim text-sm panel-bare p-4">
                No players rostered for this season.
              </p>
            )}

            {/* Add player */}
            {unrostered.length > 0 && (
              <form
                action={addToRoster}
                className="flex flex-wrap items-end gap-3 p-3 rounded border border-dashed border-rule"
              >
                <input type="hidden" name="team_id" value={team.id} />

                <label className="block flex-1 min-w-[200px]">
                  <span className="eyebrow">Add player</span>
                  <select name="player_id" className={inputCls}>
                    {unrostered.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.last_name}, {p.first_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="eyebrow">Position</span>
                  <select name="position" defaultValue="forward" className={inputCls}>
                    <option value="forward">Forward</option>
                    <option value="defense">Defense</option>
                    <option value="goalie">Goalie</option>
                  </select>
                </label>

                <label className="block w-24">
                  <span className="eyebrow">Jersey #</span>
                  <input
                    type="number"
                    name="jersey_number"
                    min={0}
                    max={99}
                    placeholder="—"
                    className={inputCls}
                  />
                </label>

                <div className="pb-1">
                  <button
                    type="submit"
                    className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
                  >
                    ADD
                  </button>
                </div>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RemoveButton({
  teamId,
  playerId,
}: {
  teamId: string;
  playerId: string;
}) {
  return (
    <form action={removeFromRoster}>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="player_id" value={playerId} />
      <button
        type="submit"
        className="min-h-11 px-3 text-goal/70 hover:text-goal font-display tracking-[0.14em] text-[12px] rounded border border-transparent hover:border-goal/30 transition-colors"
      >
        REMOVE
      </button>
    </form>
  );
}
