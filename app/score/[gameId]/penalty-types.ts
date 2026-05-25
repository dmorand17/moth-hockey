export const PENALTY_TYPES = [
  "tripping",
  "hooking",
  "slashing",
  "high_sticking",
  "interference",
  "holding",
  "roughing",
  "cross_checking",
  "other",
] as const;
export type PenaltyType = (typeof PENALTY_TYPES)[number];
