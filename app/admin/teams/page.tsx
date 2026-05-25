import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import { createTeam, updateTeam } from "./actions";
import { ColorSwatches } from "./color-swatches";

type SearchParams = Promise<{ saved?: string; error?: string }>;

const FLASH_MESSAGES: Record<string, string> = {
  created: "Team created.",
  updated: "Team updated.",
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

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, slug, color")
    .eq("season_id", season.id)
    .order("name");

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
          <label className="block">
            <span className="eyebrow">Name</span>
            <input
              type="text"
              name="name"
              required
              placeholder="Ice Holes"
              className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
            />
          </label>
          <div>
            <span className="eyebrow">Color</span>
            <ColorSwatches name="color" defaultValue="#ef4444" idPrefix="new-team" />
          </div>
          <button
            type="submit"
            className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
          >
            CREATE
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink">TEAMS</h2>
        {(teams ?? []).length === 0 ? (
          <p className="text-ink-dim text-sm">No teams yet for {season.name}.</p>
        ) : (
          <ul className="space-y-2">
            {(teams ?? []).map((team) => (
              <li key={team.id} className="panel p-3">
                <form action={updateTeam} className="space-y-3">
                  <input type="hidden" name="id" value={team.id} />
                  <input type="hidden" name="slug" value={team.slug} />
                  <label className="block">
                    <span className="eyebrow">Name</span>
                    <input
                      type="text"
                      name="name"
                      required
                      defaultValue={team.name}
                      className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
                    />
                    <span className="mt-1 block font-mono text-xs text-ink-faint">/{team.slug}</span>
                  </label>
                  <div>
                    <span className="eyebrow">Color</span>
                    <ColorSwatches name="color" defaultValue={team.color} idPrefix={`team-${team.id}`} />
                  </div>
                  <button
                    type="submit"
                    className="min-h-11 px-4 bg-board-3 hover:bg-rule border border-rule text-ink-dim hover:text-ink font-display tracking-[0.14em] text-[13px] rounded transition-colors"
                  >
                    SAVE
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
