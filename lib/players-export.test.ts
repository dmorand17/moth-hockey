import { describe, expect, test } from "bun:test";
import {
  csvCell,
  filterPlayers,
  parsePlayerColumns,
  parsePlayerFilters,
  playerFiltersQuery,
  playersCsv,
  playersCsvFilename,
  toCsv,
  PLAYER_CSV_COLUMNS,
  type FilterablePlayer,
  type PlayerCsvColumnId,
} from "./players-export";

const red = { id: "t-red", name: "Red Wings" };
const players: FilterablePlayer[] = [
  { first_name: "Wayne", last_name: "Gretzky", current_team: red, jersey_number: 99, position: "forward", account: { email: "wayne@example.com", role: "admin" } },
  { first_name: "Patrick", last_name: "Roy", current_team: null, jersey_number: null, position: null, account: null },
];

describe("csvCell", () => {
  test("leaves plain values bare and blanks nulls", () => {
    expect(csvCell("Gretzky")).toBe("Gretzky");
    expect(csvCell(99)).toBe("99");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  test("quotes commas, quotes, and newlines", () => {
    expect(csvCell("Gretzky, Wayne")).toBe('"Gretzky, Wayne"');
    expect(csvCell('The "Great One"')).toBe('"The ""Great One"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  test("neutralises formula injection", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("=A1,B1")).toBe(`"'=A1,B1"`);
    // Numbers are data, not formulas.
    expect(csvCell(-1)).toBe("-1");
  });

  test("leaves apostrophes in names alone", () => {
    expect(csvCell("O'Brien")).toBe("O'Brien");
  });
});

describe("toCsv", () => {
  test("joins with CRLF and ends with a newline", () => {
    expect(toCsv([["a", "b"], [1, null]])).toBe("a,b\r\n1,\r\n");
  });
});

describe("filterPlayers", () => {
  test("matches the screen's search, team, and account filters", () => {
    expect(filterPlayers(players, { search: "  wayne gr ", team: "", link: "all" })).toHaveLength(1);
    expect(filterPlayers(players, { search: "", team: "unrostered", link: "all" })[0].last_name).toBe("Roy");
    expect(filterPlayers(players, { search: "", team: "t-red", link: "all" })[0].last_name).toBe("Gretzky");
    expect(filterPlayers(players, { search: "", team: "", link: "linked" })).toHaveLength(1);
    expect(filterPlayers(players, { search: "", team: "", link: "unlinked" })[0].last_name).toBe("Roy");
    expect(filterPlayers(players, { search: "", team: "", link: "all" })).toHaveLength(2);
  });
});

describe("filter query round-trip", () => {
  test("omits defaults and parses back", () => {
    expect(playerFiltersQuery({ search: " ", team: "", link: "all" })).toBe("");
    const qs = playerFiltersQuery({ search: "roy", team: "unrostered", link: "unlinked" });
    expect(parsePlayerFilters(new URLSearchParams(qs))).toEqual({ search: "roy", team: "unrostered", link: "unlinked" });
  });

  test("falls back to 'all' for an unknown link value", () => {
    expect(parsePlayerFilters(new URLSearchParams("link=bogus")).link).toBe("all");
  });
});

const allColumns: PlayerCsvColumnId[] = PLAYER_CSV_COLUMNS.map((column) => column.id);

describe("playersCsv", () => {
  test("writes a header and one row per player", () => {
    expect(playersCsv(players, "Fall 2026", allColumns)).toBe(
      "Season,Last name,First name,Team,Jersey,Position,Account,Email,Role\r\n" +
        "Fall 2026,Gretzky,Wayne,Red Wings,99,Forward,Linked,wayne@example.com,admin\r\n" +
        "Fall 2026,Roy,Patrick,Unrostered,,,Not linked,,\r\n",
    );
  });

  test("defaults to last name and first name", () => {
    expect(playersCsv(players, "Fall 2026")).toBe(
      "Last name,First name\r\nGretzky,Wayne\r\nRoy,Patrick\r\n",
    );
  });

  test("writes a custom subset and still escapes formulas", () => {
    expect(playersCsv(players, "Fall 2026", ["team", "jersey"])).toBe(
      "Team,Jersey\r\nRed Wings,99\r\nUnrostered,\r\n",
    );
    const evil: FilterablePlayer[] = [
      { ...players[0], last_name: "=cmd", first_name: "+1" },
    ];
    expect(playersCsv(evil, "Fall 2026")).toBe("Last name,First name\r\n'=cmd,'+1\r\n");
  });
});

describe("parsePlayerColumns", () => {
  test("defaults when the param is missing or empty", () => {
    expect(parsePlayerColumns(null)).toEqual(["last_name", "first_name"]);
    expect(parsePlayerColumns("")).toEqual(["last_name", "first_name"]);
    expect(parsePlayerColumns("  ")).toEqual(["last_name", "first_name"]);
  });

  test("keeps an allowlisted subset in column order", () => {
    expect(parsePlayerColumns("jersey,team")).toEqual(["team", "jersey"]);
    expect(parsePlayerColumns(" last_name , email ")).toEqual(["last_name", "email"]);
  });

  test("falls back to names when any value is not allowlisted", () => {
    expect(parsePlayerColumns("bogus")).toEqual(["last_name", "first_name"]);
    expect(parsePlayerColumns("last_name,nope")).toEqual(["last_name", "first_name"]);
    expect(parsePlayerColumns("LAST_NAME")).toEqual(["last_name", "first_name"]);
  });
});

describe("playersCsvFilename", () => {
  test("dates the file in the league time zone", () => {
    // 02:00 UTC on Nov 22 is still Nov 21 in New York.
    expect(playersCsvFilename(new Date("2026-11-22T02:00:00Z"))).toBe("moth-players-2026-11-21.csv");
  });
});
