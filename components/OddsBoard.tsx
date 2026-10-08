import type { Projection } from "@/lib/matchup";

// The projected line for a scheduled game, sportsbook-board style: each side's
// moneyline and win odds, with the over/under in the middle.
export function OddsBoard({ projection: p, awayName, homeName }: { projection: Projection; awayName: string; homeName: string }) {
  const side = (name: string, moneyline: string, winProbability: number, expectedGoals: number) => (
    <div className="min-w-0">
      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-dim truncate">{name}</div>
      <div className="digit text-[32px] sm:text-[40px] leading-none text-ink tnum mt-2">{moneyline}</div>
      <div className="digit text-[20px] text-ink tnum mt-2">{Math.round(winProbability * 100)}%</div>
      <div className="text-[12px] text-ink-faint tnum mt-1">{expectedGoals.toFixed(2)} xG</div>
    </div>
  );
  return (
    <div className="border border-rule rounded-[2px] bg-board-2 p-4">
      <div className="grid grid-cols-3 gap-3 text-center items-start">
        {side(awayName, p.moneylineAway, p.winProbabilityAway, p.expectedGoalsAway)}
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-dim">Over/under</div>
          <div className="digit text-[32px] sm:text-[40px] leading-none text-ink tnum mt-2">{p.overUnderLine}</div>
        </div>
        {side(homeName, p.moneylineHome, p.winProbabilityHome, p.expectedGoalsHome)}
      </div>
      <p className="mt-3 text-center text-[12px] text-ink-faint">Moneyline · win odds · expected goals. For fun — not betting advice.</p>
    </div>
  );
}
