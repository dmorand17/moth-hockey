import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { getCurrentSeason } from "@/lib/queries";
import {
  filterPlayers,
  parsePlayerColumns,
  parsePlayerFilters,
  playersCsv,
  playersCsvFilename,
} from "@/lib/players-export";
import { loadAdminPlayers } from "../data";

// CSV download of the admin players list for the current season, honoring
// the screen's filters (?q=&team=&link=) and column pick (?columns=).
// Admins only — route handlers don't sit under the admin layout's gate, so
// check the role here. Unknown columns fall back to names only.
export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ error: "No current season." }, { status: 404 });

  const { players } = await loadAdminPlayers(season.id);
  const params = request.nextUrl.searchParams;
  const filtered = filterPlayers(players, parsePlayerFilters(params));
  const columns = parsePlayerColumns(params.get("columns"));
  // Leading BOM so Excel opens the UTF-8 file with accented names intact.
  const body = "\uFEFF" + playersCsv(filtered, season.name, columns);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${playersCsvFilename(new Date())}"`,
      "Cache-Control": "no-store",
    },
  });
}
