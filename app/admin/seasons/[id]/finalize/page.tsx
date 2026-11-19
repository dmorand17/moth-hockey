import Link from "next/link";
import { seasonSlug } from "@/lib/seasons";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSeasonFinalizeInputs } from "@/lib/queries";
import { AWARD_LABELS } from "@/lib/awards";
import {
  AWARD_RULES,
  FINALIZE_AWARDS,
  championTeamId,
  computeSeasonTotals,
  finalizeBlockers,
  proposeAwards,
  type FinalizeAward,
  type SeasonTotals,
} from "@/lib/season-finalize";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { TeamBadge } from "@/components/TeamBadge";
import { finalizeSeason } from "../../actions";

const primaryBtn =
  "min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-semibold tracking-[0.06em] text-[13px] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const selectCls =
  "bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice w-full sm:w-auto sm:min-w-[260px]";

// The stat shown beside each candidate in an award's dropdown.
function awardStat(type: FinalizeAward, t: SeasonTotals): string {
  switch (type) {
    case "mvp":
    case "mvd":
      return `${t.goals + t.assists} PTS`;
    case "sniper":
      return `${t.goals} G`;
    case "playmaker":
      return `${t.assists} A`;
    case "goon":
      return `${t.penalties} PEN`;
    case "vezina":
      return `${((t.goals_against ?? 0) / t.games_played).toFixed(2)} GAA · ${t.games_played} GP`;
    default:
      return "";
  }
}

function candidatesFor(type: FinalizeAward, totals: SeasonTotals[]): SeasonTotals[] {
  if (type === "mvd") return totals.filter((t) => t.position === "defense");
  if (type === "vezina") return totals.filter((t) => t.position === "goalie");
  if (type === "goon") return totals;
  return totals.filter((t) => t.position !== "goalie");
}

export default async function FinalizeSeasonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: season } = await supabase
    .from("seasons")
    .select("id, name, finalized_at")
    .eq("id", id)
    .maybeSingle();
  if (!season) notFound();

  const inputs = await getSeasonFinalizeInputs(id);
  const [{ data: teams }, { data: players }] = await Promise.all([
    supabase.from("teams").select("id, name, slug, color").eq("season_id", id),
    inputs.roster.length > 0
      ? supabase
          .from("players")
          .select("id, first_name, last_name")
          .in("id", inputs.roster.map((r) => r.player_id))
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
  ]);
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const nameById = new Map((players ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const name = (pid: string) => nameById.get(pid) ?? "Unknown player";

  const blockers = finalizeBlockers(inputs.games);
  const totals = computeSeasonTotals(inputs.games, inputs.roster, inputs.appearances, inputs.events);
  const proposed = proposeAwards(totals, inputs.roster, inputs.games);
  const champTeam = teamById.get(championTeamId(inputs.games) ?? "");
  const skaterCount = totals.filter((t) => t.position !== "goalie").length;
  const byPoints = [...totals]
    .filter((t) => t.position !== "goalie")
    .sort((a, b) => b.goals + b.assists - (a.goals + a.assists) || b.goals - a.goals);
  const goalies = totals
    .filter((t) => t.position === "goalie")
    .sort((a, b) => (a.goals_against ?? 0) / a.games_played - (b.goals_against ?? 0) / b.games_played);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/seasons" className="eyebrow hover:text-ink transition-colors inline-flex items-center min-h-11">
          ← Seasons
        </Link>
        <h1 className="font-display text-2xl tracking-[0.04em] text-ink">
          FINALIZE {season.name.toUpperCase()}
        </h1>
        <p className="text-ink-dim text-[13px] mt-1 max-w-2xl">
          Saves each player&apos;s regular-season totals as this season&apos;s permanent stats and
          records the award winners. Do this before activating the next season — past seasons read
          from these saved totals.
        </p>
        {season.finalized_at && (
          <p className="text-ink-faint text-[12px] mt-2">
            Finalized {new Date(season.finalized_at).toLocaleString()}. Finalizing again replaces
            the saved totals and awards.
          </p>
        )}
        {season.finalized_at && (
          <Link
            href={`/seasons/${seasonSlug(season.name)}/recap`}
            className="mt-2 inline-flex items-center min-h-11 text-[14px] font-semibold text-ice hover:text-ink transition-colors"
          >
            Season recap <span aria-hidden className="ml-1">→</span>
          </Link>
        )}
      </div>

      {blockers.length > 0 && (
        <div className="panel-bare rounded-lg p-4 border border-goal/40">
          <div className="eyebrow text-goal mb-2">Not ready to finalize</div>
          <ul className="list-disc pl-5 text-[13px] text-ink-dim space-y-1">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <ActionForm action={finalizeSeason} className="space-y-6">
        <input type="hidden" name="season_id" value={season.id} />

        <section className="panel p-4 sm:p-5 space-y-5">
          <h2 className="font-display text-xl tracking-[0.04em] text-ink">AWARDS</h2>
          <p className="text-ink-faint text-[12px] -mt-3">
            Pre-filled with the stat leaders; ties are co-winners. Change any pick, add a co-winner,
            or set a slot to “—” to remove it.
          </p>

          <div>
            <div className="eyebrow">{AWARD_LABELS.champion}</div>
            <p className="text-ink-faint text-[11px]">{AWARD_RULES.champion}</p>
            <div className="mt-2 text-[13px] text-ink-dim">
              {champTeam ? (
                <div className="flex flex-wrap items-center gap-2">
                  <TeamBadge name={champTeam.name} slug={champTeam.slug} color={champTeam.color} size="sm" />
                  <span>{proposed.champion.map(name).join(", ")}</span>
                </div>
              ) : (
                "Decided once the playoff final is played."
              )}
            </div>
          </div>

          {FINALIZE_AWARDS.filter((t) => t !== "champion").map((type) => {
            const candidates = candidatesFor(type, totals).sort((a, b) => name(a.player_id).localeCompare(name(b.player_id)));
            const picks = [...proposed[type], ""]; // trailing blank = add a co-winner
            return (
              <div key={type}>
                <div className="eyebrow">{AWARD_LABELS[type]}</div>
                <p className="text-ink-faint text-[11px]">{AWARD_RULES[type]}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {picks.map((pick, i) => (
                    <select key={`${type}-${i}`} name={`award_${type}`} defaultValue={pick} className={selectCls}>
                      <option value="">{i < proposed[type].length ? "—" : "— add co-winner —"}</option>
                      {candidates.map((c) => (
                        <option key={c.player_id} value={c.player_id}>
                          {name(c.player_id)} · {awardStat(type, c)}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <section className="panel p-4 sm:p-5">
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer list-none select-none min-h-9">
              <span className="text-ink-faint text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block">
                ▶
              </span>
              <h2 className="font-display text-xl tracking-[0.04em] text-ink">SEASON TOTALS</h2>
              <span className="eyebrow ml-auto">
                {skaterCount} skaters · {goalies.length} goalies
              </span>
            </summary>
            <div className="overflow-x-auto mt-3">
              <table className="board-table striped min-w-[520px]">
                <thead>
                  <tr>
                    <th className="text-left">Skater</th>
                    <th className="text-left">Team</th>
                    <th className="text-right">GP</th>
                    <th className="text-right">G</th>
                    <th className="text-right">A</th>
                    <th className="text-right">PTS</th>
                    <th className="text-right">PEN</th>
                  </tr>
                </thead>
                <tbody>
                  {byPoints.map((t) => (
                    <tr key={t.player_id}>
                      <td>{name(t.player_id)}</td>
                      <td className="text-ink-dim">{teamById.get(t.team_id)?.name ?? "—"}</td>
                      <td className="text-right tnum">{t.games_played}</td>
                      <td className="text-right tnum">{t.goals}</td>
                      <td className="text-right tnum">{t.assists}</td>
                      <td className="text-right tnum text-ink">{t.goals + t.assists}</td>
                      <td className="text-right tnum">{t.penalties}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="board-table striped min-w-[520px] mt-4">
                <thead>
                  <tr>
                    <th className="text-left">Goalie</th>
                    <th className="text-left">Team</th>
                    <th className="text-right">GP</th>
                    <th className="text-right">W-L-OTL</th>
                    <th className="text-right">GA</th>
                    <th className="text-right">GAA</th>
                  </tr>
                </thead>
                <tbody>
                  {goalies.map((t) => (
                    <tr key={t.player_id}>
                      <td>{name(t.player_id)}</td>
                      <td className="text-ink-dim">{teamById.get(t.team_id)?.name ?? "—"}</td>
                      <td className="text-right tnum">{t.games_played}</td>
                      <td className="text-right tnum">{`${t.wins}-${t.losses}-${t.ot_losses}`}</td>
                      <td className="text-right tnum">{t.goals_against}</td>
                      <td className="text-right tnum text-ink">
                        {((t.goals_against ?? 0) / t.games_played).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <SubmitButton className={primaryBtn} disabled={blockers.length > 0} pendingLabel="FINALIZING…">
          {season.finalized_at ? "RE-FINALIZE SEASON" : "FINALIZE SEASON"}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
