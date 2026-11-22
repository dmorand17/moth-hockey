// Pure helpers behind the admin players screen's filters and its CSV export.
// Shared by the client filter UI and the export route so the downloaded file
// always matches what the admin sees, including which columns they picked.

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

export const PLAYER_CSV_COLUMNS = [
  { id: "season", header: "Season" },
  { id: "last_name", header: "Last name" },
  { id: "first_name", header: "First name" },
  { id: "team", header: "Team" },
  { id: "jersey", header: "Jersey" },
  { id: "position", header: "Position" },
  { id: "account", header: "Account" },
  { id: "email", header: "Email" },
  { id: "role", header: "Role" },
] as const;

export type PlayerCsvColumnId = (typeof PLAYER_CSV_COLUMNS)[number]["id"];

/** Names only — used when the export URL omits `columns` or sends a bad value. */
export const DEFAULT_PLAYER_CSV_COLUMNS = ["last_name", "first_name"] as const satisfies readonly PlayerCsvColumnId[];

const PLAYER_CSV_COLUMN_IDS = new Set<string>(PLAYER_CSV_COLUMNS.map((c) => c.id));

/**
 * Allowlisted column ids from `?columns=last_name,first_name`.
 * Missing, empty, or any unknown id falls back to the name-only default.
 * Valid ids are returned once, in the column list's order.
 */
export function parsePlayerColumns(raw: string | null): PlayerCsvColumnId[] {
  if (raw == null || raw.trim() === "") return [...DEFAULT_PLAYER_CSV_COLUMNS];
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.some((part) => !PLAYER_CSV_COLUMN_IDS.has(part))) {
    return [...DEFAULT_PLAYER_CSV_COLUMNS];
  }
  const selected = new Set(parts);
  return PLAYER_CSV_COLUMNS.map((column) => column.id).filter((id) => selected.has(id));
}

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

export const PLAYER_CSV_HEADER = PLAYER_CSV_COLUMNS.map((column) => column.header);

function columnValue(
  player: FilterablePlayer,
  seasonName: string,
  column: PlayerCsvColumnId,
): CsvValue {
  switch (column) {
    case "season":
      return seasonName;
    case "last_name":
      return player.last_name;
    case "first_name":
      return player.first_name;
    case "team":
      return player.current_team?.name ?? "Unrostered";
    case "jersey":
      return player.jersey_number;
    case "position":
      return player.position ? POSITION_LABEL[player.position] : null;
    case "account":
      return player.account ? "Linked" : "Not linked";
    case "email":
      return player.account?.email || null;
    case "role":
      return player.account?.role ?? null;
  }
}

function columnHeader(id: PlayerCsvColumnId): string {
  for (const column of PLAYER_CSV_COLUMNS) {
    if (column.id === id) return column.header;
  }
  return id;
}

export function playersCsv(
  players: FilterablePlayer[],
  seasonName: string,
  columns: readonly PlayerCsvColumnId[] = DEFAULT_PLAYER_CSV_COLUMNS,
): string {
  const ids = columns.length > 0 ? columns : DEFAULT_PLAYER_CSV_COLUMNS;
  return toCsv([
    ids.map(columnHeader),
    ...players.map((player) => ids.map((id) => columnValue(player, seasonName, id))),
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
