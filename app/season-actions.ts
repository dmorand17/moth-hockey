"use server";

import { cookies } from "next/headers";
import { SEASON_COOKIE } from "@/lib/queries";

// Remember the season picked in the site header. A session cookie, so a closed
// browser comes back to the current season. null clears it (current season).
export async function setSelectedSeason(seasonId: string | null) {
  const jar = await cookies();
  if (seasonId) jar.set(SEASON_COOKIE, seasonId, { path: "/", sameSite: "lax", httpOnly: true });
  else jar.delete(SEASON_COOKIE);
}
