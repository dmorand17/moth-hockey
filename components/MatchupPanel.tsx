import { OddsBoard } from "@/components/OddsBoard";
import type { PreviewSource, PreviewTeam } from "@/lib/write-ups/prompt";

function TeamColumn({ team }: { team: PreviewTeam }) {
  const r = team.roster;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[18px] tracking-[0.04em] text-ink truncate">{team.name}</span>
        <span className="digit text-[15px] text-ink tnum">{team.form.record}</span>
      </div>
      <div className="text-[13px] text-ink-dim tnum">
        {team.form.points} pts · {team.form.goalsFor} GF · {team.form.goalsAgainst} GA
      </div>

      <div>
        <div className="eyebrow">Last 3</div>
        {team.form.lastThreeMostRecentFirst.length === 0 ? (
          <p className="text-[13px] text-ink-dim mt-1">No games yet</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-[13px] text-ink-dim">
            {team.form.lastThreeMostRecentFirst.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="eyebrow">Top scorers</div>
        <ul className="mt-1 space-y-0.5 text-[13px] text-ink-dim">
          {team.topScorers.length === 0 ? <li>None yet</li> : team.topScorers.map((s) => (
            <li key={s.playerId}>{s.name} · {s.goals} G</li>
          ))}
        </ul>
      </div>

      <div>
        <div className="eyebrow">Projected roster</div>
        <p className="mt-1 text-[13px] text-ink-dim tnum">
          {r.inCount} in · {r.outCount} out · {r.noResponseCount} no response
          {r.subsLinedUp.length > 0 && ` · ${r.subsLinedUp.length} sub${r.subsLinedUp.length === 1 ? "" : "s"}`}
        </p>
        {r.outKeyPlayers.length > 0 && (
          <p className="text-[13px] text-ink-dim">Out: {r.outKeyPlayers.join(", ")}</p>
        )}
        {r.rosteredGoalie && <p className="text-[13px] text-ink-dim">Goalie: {r.rosteredGoalie}</p>}
      </div>
    </div>
  );
}

// Live, deterministic matchup numbers for a scheduled game. No AI involved;
// the AI preview (when present) is rendered separately above this.
export function MatchupPanel({ source }: { source: PreviewSource }) {
  const p = source.projection;
  const k = source.keyMatchup;
  return (
    <div className="panel p-4 sm:p-5 space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TeamColumn team={source.away} />
        <TeamColumn team={source.home} />
      </div>

      {k && (
        <div className="border-t border-rule pt-4">
          <div className="eyebrow">Key matchup</div>
          <p className="mt-1 text-[14px] text-ink">
            {k.scorer.name} ({k.scorer.team}, {k.scorer.goals} G) vs {k.goalie.name} ({k.goalie.team},{" "}
            {k.goalie.teamGaPerGame.toFixed(2)} GA/game)
          </p>
        </div>
      )}

      <div className="border-t border-rule pt-4">
        <div className="eyebrow">Projection</div>
        {p ? (
          <div className="mt-2">
            <OddsBoard projection={p} awayName={source.away.name} homeName={source.home.name} />
          </div>
        ) : (
          <p className="mt-1 text-[13px] text-ink-dim">Projections start after week 2.</p>
        )}
      </div>
    </div>
  );
}
