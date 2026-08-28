type Round = "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final" | null | undefined;

const LABEL: Record<"qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final", string> = {
  qf1: "QF1",
  qf2: "QF2",
  qf3: "QF3",
  qf4: "QF4",
  sf1: "SF1",
  sf2: "SF2",
  final: "F",
};

export function PlayoffChip({
  round,
  size = "md",
}: {
  round: Round;
  size?: "sm" | "md";
}) {
  const cls =
    size === "sm" ? "text-[9px] px-1 py-0" : "text-[10px] px-1.5 py-0.5";
  const label = round ? LABEL[round] : "PLAYOFF";
  return <span className={`chip chip-playoff ${cls}`}>{label}</span>;
}
