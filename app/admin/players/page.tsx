import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { createPlayer, importPlayers, updateUserRole, linkUserToPlayer } from "./actions";
import { PlayerCombobox } from "@/components/PlayerCombobox";
import {
  PlayerFilters,
  type PlayerRow,
  type Team,
  type UnlinkedAccount,
  type RoleOption,
} from "./PlayerFilters";

// Defined here (a server module) — exporting it from the "use client"
// PlayerFilters module would turn it into a client-reference proxy on the
// server and break the Needs-linking section's .map().
const ROLE_OPTIONS: RoleOption[] = [
  { value: "admin", label: "Admin" },
  { value: "scorekeeper", label: "Scorekeeper" },
  { value: "player", label: "Player" },
];

type SearchParams = Promise<{
  saved?: string;
  error?: string;
  added?: string;
  dup?: string;
  bad?: string;
}>;

const FLASH_MESSAGES: Record<string, string> = {
  created: "Player created.",
  updated: "Player updated.",
  role: "Role updated.",
  link: "Player link updated.",
};
const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "First and last name are required.",
};

function importSummary(params: {
  added?: string;
  dup?: string;
  bad?: string;
}): string {
  const added = Number(params.added ?? 0);
  const dup = Number(params.dup ?? 0);
  const bad = Number(params.bad ?? 0);
  const parts = [`Added ${added}`];
  if (dup > 0) parts.push(`skipped ${dup} duplicate${dup === 1 ? "" : "s"}`);
  if (bad > 0)
    parts.push(`${bad} line${bad === 1 ? "" : "s"} couldn't be parsed`);
  return parts.join(" · ") + ".";
}

type RosterEntry = {
  season_id: string;
  position: "forward" | "defense" | "goalie";
  jersey_number: number | null;
  team: { id: string; name: string; color: string } | null;
};

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();
  if (!season) return <NoSeason isAdmin />;

  const params = await searchParams;
  const flash = params.saved;
  const error = params.error;

  const [{ data: rawPlayers }, { data: profiles }, { data: roles }] =
    await Promise.all([
      supabase
        .from("players")
        .select(
          "id, first_name, last_name, user_id, team_players(season_id, position, jersey_number, team:team_id(id, name, color))",
        )
        .order("last_name")
        .order("first_name"),
      supabase
        .from("user_profiles")
        .select("user_id, email, full_name")
        .order("created_at", { ascending: true }),
      supabase.from("user_roles").select("user_id, role"),
    ]);

  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
  const profileByUser = new Map(
    (profiles ?? []).map((p) => [p.user_id, p]),
  );

  // Flatten players into rows with current-season roster + linked account.
  const players: PlayerRow[] = (rawPlayers ?? []).map((p) => {
    const rosterEntry = (
      p.team_players as unknown as RosterEntry[]
    )?.find((tp) => tp.season_id === season.id);

    const profile = p.user_id ? profileByUser.get(p.user_id) : null;

    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      current_team: rosterEntry?.team ?? null,
      jersey_number: rosterEntry?.jersey_number ?? null,
      position: rosterEntry?.position ?? null,
      account: p.user_id
        ? {
            user_id: p.user_id,
            email: profile?.email ?? "",
            role: roleByUser.get(p.user_id) ?? null,
          }
        : null,
    };
  });

  // Accounts that exist but aren't linked to any player → the "Needs linking"
  // callout, and the per-row "link account" dropdown in the list.
  const linkedUserIds = new Set(
    (rawPlayers ?? []).map((p) => p.user_id).filter((id): id is string => !!id),
  );
  const unlinkedAccounts: UnlinkedAccount[] = (profiles ?? [])
    .filter((p) => !linkedUserIds.has(p.user_id))
    .map((p) => ({
      user_id: p.user_id,
      email: p.email,
      full_name: p.full_name,
      role: roleByUser.get(p.user_id) ?? null,
    }));

  // Players with no account → "link to player" dropdown in the callout.
  const unlinkedPlayers = (rawPlayers ?? [])
    .filter((p) => !p.user_id)
    .map((p) => ({ id: p.id, name: `${p.last_name}, ${p.first_name}` }));

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
          {flash === "imported"
            ? importSummary(params)
            : (FLASH_MESSAGES[flash] ?? "Saved.")}
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

      {/* Bulk import */}
      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink">
          IMPORT PLAYERS
        </h2>
        <form action={importPlayers} className="panel p-4 space-y-3">
          <label className="block">
            <span className="eyebrow">Paste names — one per line</span>
            <textarea
              name="names"
              required
              rows={6}
              placeholder={"Wayne Gretzky\nGretzky, Wayne"}
              className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 text-ink focus:outline-none focus:border-ice font-mono text-[13px]"
            />
          </label>
          <p className="text-ink-faint text-[12px] leading-relaxed">
            One player per line — use <strong>First Last</strong> or{" "}
            <strong>Last, First</strong>. Names already in the list are skipped.
          </p>
          <button
            type="submit"
            className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
          >
            IMPORT
          </button>
        </form>
      </section>

      {/* Accounts awaiting a player link */}
      {unlinkedAccounts.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-xl tracking-[0.04em] text-goal">
            ⚠ NEEDS LINKING{" "}
            <span className="eyebrow text-ink-faint align-middle">
              {unlinkedAccounts.length}
            </span>
          </h2>
          <p className="text-ink-dim text-[12px]">
            Signed-up accounts not yet linked to a player.
          </p>
          <ul className="border border-goal/30 rounded divide-y divide-rule/50">
            {unlinkedAccounts.map((acct) => (
              <li key={acct.user_id}>
                <details className="group">
                  <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none select-none hover:bg-board-3 transition-colors">
                    <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
                      ▶
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-ink text-[13px]">
                        {acct.full_name || acct.email}
                      </span>
                      {acct.full_name && (
                        <span className="font-mono text-[11px] text-ink-faint ml-2 truncate">
                          {acct.email}
                        </span>
                      )}
                    </div>
                    <span className="eyebrow text-[10px] text-ink-faint shrink-0">
                      {acct.role ?? "player"}
                    </span>
                  </summary>

                  <div className="border-t border-rule/50 px-3 py-3 flex flex-col sm:flex-row sm:items-end gap-3">
                    <form action={updateUserRole} className="flex items-end gap-2 shrink-0">
                      <input type="hidden" name="user_id" value={acct.user_id} />
                      <label className="block">
                        <span className="eyebrow">Role</span>
                        <select
                          name="role"
                          defaultValue={acct.role ?? "player"}
                          className="mt-1 bg-board-3 border border-rule rounded px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ice"
                        >
                          {acct.role === "team_captain" && (
                            <option value="team_captain" disabled>
                              Team Captain (via Teams)
                            </option>
                          )}
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.1em] text-[11px] rounded transition-colors"
                      >
                        SAVE
                      </button>
                    </form>

                    <form action={linkUserToPlayer} className="flex items-end gap-2 flex-1">
                      <input type="hidden" name="user_id" value={acct.user_id} />
                      <label className="block flex-1">
                        <span className="eyebrow">Link to player</span>
                        <div className="mt-1">
                          <PlayerCombobox
                            name="player_id"
                            placeholder="Search players…"
                            options={unlinkedPlayers.map((p) => ({ value: p.id, label: p.name }))}
                          />
                        </div>
                      </label>
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.1em] text-[11px] rounded transition-colors shrink-0"
                      >
                        LINK
                      </button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filterable list */}
      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink">
          PLAYERS
        </h2>
        <PlayerFilters
          players={players}
          teams={teams}
          unlinkedAccounts={unlinkedAccounts}
          roleOptions={ROLE_OPTIONS}
        />
      </section>
    </div>
  );
}
