type Round = "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final" | null | undefined;

const LABEL: Record<"qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final", string> = {
  qf1: "QF1",
  qf2: "QF2",
  qf3: "QF3",
  qf4: "QF4",
  sf1: "SF1",
  sf2: "SF2",
  final: "Championship",
};

// `size` is kept for call-site compatibility; chips share one 12px size.
export function PlayoffChip({ round }: { round: Round; size?: "sm" | "md" }) {
  const label = round ? LABEL[round] : "Playoff";
  return <span className="chip chip-playoff">{label}</span>;
}
