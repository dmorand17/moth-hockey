// Pure helpers behind the admin players screen's filters and its CSV export.
// Shared by the client filter UI and the export route so the downloaded file
// always matches what the admin sees.

export type PlayerLinkFilter = "all" | "linked" | "unlinked";

export type PlayerFilterState = {
  search: string;
  /** Team id, "unrostered", or "" for all teams. */
  team: string;
  link: PlayerLinkFilter;
};

export type FilterablePlayer = {
  first_name: string;
  last_name: string;
  current_team: { id: string; name: string } | null;
  jersey_number: number | null;
  position: "forward" | "defense" | "goalie" | null;
  account: { email: string; role: string | null } | null;
};

export function filterPlayers<T extends FilterablePlayer>(
  players: T[],
  { search, team, link }: PlayerFilterState,
): T[] {
  const q = search.trim().toLowerCase();
  return players.filter((p) => {
    if (q) {
      const full = `${p.first_name} ${p.last_name}`.toLowerCase();
      if (!full.includes(q)) return false;
    }
    if (team === "unrostered" && p.current_team) return false;
    if (team && team !== "unrostered" && p.current_team?.id !== team) return false;
    if (link === "linked" && !p.account) return false;
    if (link === "unlinked" && p.account) return false;
    return true;
  });
}

/** Reads filter state from the export URL's query (?q=&team=&link=). */
export function parsePlayerFilters(params: URLSearchParams): PlayerFilterState {
  const link = params.get("link");
  return {
    search: params.get("q") ?? "",
    team: params.get("team") ?? "",
    link: link === "linked" || link === "unlinked" ? link : "all",
  };
}

/** Builds the export URL's query string; omits defaults. */
export function playerFiltersQuery({ search, team, link }: PlayerFilterState): string {
  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  if (team) params.set("team", team);
  if (link !== "all") params.set("link", link);
  return params.toString();
}

type CsvValue = string | number | null | undefined;

// Quotes per RFC 4180 and neutralises spreadsheet formula injection: a text
// cell starting with = + - @ (or tab / CR) is prefixed with ' so Excel and
// Sheets show it as text instead of evaluating it.
export function csvCell(value: CsvValue): string {
  if (value == null) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const POSITION_LABEL: Record<string, string> = {
  forward: "Forward",
  defense: "Defense",
  goalie: "Goalie",
};

export const PLAYER_CSV_HEADER = [
  "Season",
  "Last name",
  "First name",
  "Team",
  "Jersey",
  "Position",
  "Account",
  "Email",
  "Role",
];

export function playersCsv(players: FilterablePlayer[], seasonName: string): string {
  return toCsv([
    PLAYER_CSV_HEADER,
    ...players.map((p) => [
      seasonName,
      p.last_name,
      p.first_name,
      p.current_team?.name ?? "Unrostered",
      p.jersey_number,
      p.position ? POSITION_LABEL[p.position] : null,
      p.account ? "Linked" : "Not linked",
      p.account?.email || null,
      p.account?.role ?? null,
    ]),
  ]);
}

/** moth-players-YYYY-MM-DD.csv, dated in the league's time zone. */
export function playersCsvFilename(now: Date, timeZone = "America/New_York"): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `moth-players-${date}.csv`;
}
