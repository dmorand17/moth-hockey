import { requireRole } from "@/lib/auth";
import { getCurrentSeason } from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { createPlayer, importPlayers } from "./actions";
import { NeedsLinkingEditor } from "./NeedsLinkingEditor";
import { loadAdminPlayers } from "./data";
import { PlayerFilters, type RoleOption } from "./PlayerFilters";

// Defined here (a server module) — exporting it from the "use client"
// PlayerFilters module would turn it into a client-reference proxy on the
// server and break the Needs-linking section's .map().
const ROLE_OPTIONS: RoleOption[] = [
  { value: "admin", label: "Admin" },
  { value: "scorekeeper", label: "Scorekeeper" },
  { value: "player", label: "Player" },
];

export default async function AdminPlayersPage() {
  await requireRole(["admin"]);
  const season = await getCurrentSeason();
  if (!season) return <NoSeason isAdmin />;

  const { players, unlinkedAccounts, unlinkedPlayers, teams } =
    await loadAdminPlayers(season.id);

  return (
    <div className="space-y-6">
      {/* Create */}
      <section>
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none select-none min-h-9">
            <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
              ▶
            </span>
            <h2 className="font-display text-xl tracking-[0.04em] text-ink">
              NEW PLAYER
            </h2>
          </summary>
          <ActionForm action={createPlayer} resetOnSuccess className="panel p-4 mt-3">
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
            <SubmitButton className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-semibold tracking-[0.06em] text-[13px] rounded transition-colors shrink-0">
              CREATE
            </SubmitButton>
          </div>
          </ActionForm>
        </details>
      </section>

      {/* Bulk import — collapsed by default; used infrequently */}
      <section>
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none select-none min-h-9">
            <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
              ▶
            </span>
            <h2 className="font-display text-xl tracking-[0.04em] text-ink">
              IMPORT PLAYERS
            </h2>
          </summary>
          <ActionForm action={importPlayers} resetOnSuccess className="panel p-4 space-y-3 mt-3">
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
          <SubmitButton className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-semibold tracking-[0.06em] text-[13px] rounded transition-colors">
            IMPORT
          </SubmitButton>
          </ActionForm>
        </details>
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
          <NeedsLinkingEditor
            key={unlinkedAccounts.map((a) => a.user_id).join(",")}
            accounts={unlinkedAccounts}
            players={unlinkedPlayers}
            roleOptions={ROLE_OPTIONS}
          />
        </section>
      )}

      {/* Filterable list */}
      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink">
          PLAYERS
        </h2>
        <PlayerFilters players={players} teams={teams} />
      </section>
    </div>
  );
}
