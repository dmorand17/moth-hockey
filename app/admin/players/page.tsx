import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import { createPlayer } from "./actions";
import { PlayerFilters, type PlayerRow, type Team } from "./PlayerFilters";

type SearchParams = Promise<{ saved?: string; error?: string }>;

const FLASH_MESSAGES: Record<string, string> = {
  created: "Player created.",
  updated: "Player updated.",
};
const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "First and last name are required.",
};

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();

  const params = await searchParams;
  const flash = params.saved;
  const error = params.error;

  const { data: rawPlayers } = await supabase
    .from("players")
    .select(
      "id, first_name, last_name, user_id, team_players(season_id, position, jersey_number, team:team_id(id, name, color))",
    )
    .order("last_name")
    .order("first_name");

  // Transform into flat PlayerRow with current-season context
  const players: PlayerRow[] = (rawPlayers ?? []).map((p) => {
    const rosterEntry = (
      p.team_players as unknown as {
        season_id: string;
        jersey_number: number | null;
        team: { id: string; name: string; color: string } | null;
      }[]
    )?.find((tp) => tp.season_id === season.id);

    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      user_id: p.user_id,
      current_team: rosterEntry?.team ?? null,
      jersey_number: rosterEntry?.jersey_number ?? null,
    };
  });

  // Derive unique teams from rostered players (sorted by name)
  const teamMap = new Map<string, Team>();
  for (const p of players) {
    if (p.current_team && !teamMap.has(p.current_team.id)) {
      teamMap.set(p.current_team.id, p.current_team);
    }
  }
  const teams = Array.from(teamMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-6">
      {flash && (
        <p role="status" className="text-ice text-sm">
          {FLASH_MESSAGES[flash] ?? "Saved."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-goal text-sm">
          {ERROR_MESSAGES[error] ?? error}
        </p>
      )}

      {/* Create */}
      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink">
          NEW PLAYER
        </h2>
        <form action={createPlayer} className="panel p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block flex-1 min-w-[140px]">
              <span className="eyebrow">First name</span>
              <input
                type="text"
                name="first_name"
                required
                placeholder="Wayne"
                className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
              />
            </label>
            <label className="block flex-1 min-w-[140px]">
              <span className="eyebrow">Last name</span>
              <input
                type="text"
                name="last_name"
                required
                placeholder="Gretzky"
                className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors shrink-0"
            >
              CREATE
            </button>
          </div>
        </form>
      </section>

      {/* Filterable list */}
      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <h2 className="font-display text-xl tracking-[0.04em] text-ink">
            PLAYERS
          </h2>
          <span className="eyebrow">{players.length} total</span>
        </header>
        <PlayerFilters players={players} teams={teams} />
      </section>
    </div>
  );
}
