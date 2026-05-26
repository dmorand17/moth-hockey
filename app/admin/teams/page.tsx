import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import { assignTeamCaptain, createTeam, updateTeam } from "./actions";
import { ColorSwatches } from "./color-swatches";

type SearchParams = Promise<{ saved?: string; error?: string }>;

const FLASH_MESSAGES: Record<string, string> = {
  created: "Team created.",
  updated: "Team updated.",
  captain: "Captain assignment updated.",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Name and slug are required.",
  invalid_color: "Color must be a hex value like #ef4444.",
};

export default async function AdminTeamsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();

  const params = await searchParams;
  const flash = params.saved;
  const error = params.error;

  const [{ data: teams }, { data: profiles }, { data: captains }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, slug, color")
      .eq("season_id", season.id)
      .order("name"),
    supabase
      .from("user_profiles")
      .select("user_id, email, full_name")
      .order("full_name", { ascending: true }),
    supabase
      .from("team_captains")
      .select("team_id, user_id")
      .eq("season_id", season.id),
  ]);

  const captainByTeam = new Map((captains ?? []).map((c) => [c.team_id, c.user_id]));
  const userLabel = (id: string) => {
    const p = (profiles ?? []).find((p) => p.user_id === id);
    return p?.full_name || p?.email || id;
  };

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

      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <h2 className="font-display text-xl tracking-[0.04em] text-ink">NEW TEAM</h2>
          <span className="eyebrow">{season.name}</span>
        </header>
        <form action={createTeam} className="panel p-4 space-y-3">
          <input type="hidden" name="season_id" value={season.id} />
          <div className="flex items-end gap-3">
            <label className="block flex-1">
              <span className="eyebrow">Name</span>
              <input
                type="text"
                name="name"
                required
                placeholder="Ice Holes"
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
          <div>
            <span className="eyebrow">Color</span>
            <ColorSwatches name="color" defaultValue="#ef4444" idPrefix="new-team" />
          </div>
          <div className="flex items-center gap-2">
            <span className="eyebrow shrink-0">Captain</span>
            <select
              name="captain_user_id"
              className="flex-1 bg-board-3 border border-rule rounded px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ice"
            >
              <option value="">— No captain —</option>
              {(profiles ?? []).map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {userLabel(p.user_id)}
                </option>
              ))}
            </select>
          </div>
        </form>
      </section>

      <section className="space-y-1">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink mb-2">TEAMS</h2>
        {(teams ?? []).length === 0 ? (
          <p className="text-ink-dim text-sm">No teams yet for {season.name}.</p>
        ) : (
          (teams ?? []).map((team) => (
            <details key={team.id} className="group border border-rule rounded">
              <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none select-none hover:bg-board-3 transition-colors rounded">
                <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block">
                  ▶
                </span>
                <span
                  className="h-3 w-3 rounded-sm shrink-0"
                  style={{ background: team.color }}
                />
                <span className="font-display text-[14px] tracking-[0.04em] text-ink">
                  {team.name.toUpperCase()}
                </span>
                <span className="font-mono text-[11px] text-ink-faint">/{team.slug}</span>
              </summary>
              <div className="border-t border-rule p-4 space-y-4">
                <form action={updateTeam} className="space-y-3">
                  <input type="hidden" name="id" value={team.id} />
                  <input type="hidden" name="slug" value={team.slug} />
                  <div className="flex items-end gap-3">
                    <label className="block flex-1">
                      <span className="eyebrow">Name</span>
                      <input
                        type="text"
                        name="name"
                        required
                        defaultValue={team.name}
                        className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
                      />
                    </label>
                    <button
                      type="submit"
                      className="min-h-11 px-4 bg-board-3 hover:bg-rule border border-rule text-ink-dim hover:text-ink font-display tracking-[0.14em] text-[13px] rounded transition-colors shrink-0"
                    >
                      SAVE
                    </button>
                  </div>
                  <div>
                    <span className="eyebrow">Color</span>
                    <ColorSwatches name="color" defaultValue={team.color} idPrefix={`team-${team.id}`} />
                  </div>
                </form>

                <div className="border-t border-rule/50 pt-3">
                  <form action={assignTeamCaptain} className="flex items-center gap-2">
                    <input type="hidden" name="team_id" value={team.id} />
                    <input type="hidden" name="season_id" value={season.id} />
                    <span className="eyebrow shrink-0">Captain</span>
                    <select
                      name="user_id"
                      defaultValue={captainByTeam.get(team.id) ?? ""}
                      className="flex-1 bg-board-3 border border-rule rounded px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-ice"
                    >
                      <option value="">— No captain —</option>
                      {(profiles ?? []).map((p) => (
                        <option key={p.user_id} value={p.user_id}>
                          {userLabel(p.user_id)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-board-3 hover:bg-rule border border-rule text-ink-dim hover:text-ink font-display tracking-[0.1em] text-[11px] rounded transition-colors shrink-0"
                    >
                      SAVE
                    </button>
                  </form>
                </div>
              </div>
            </details>
          ))
        )}
      </section>
    </div>
  );
}
