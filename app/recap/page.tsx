import { notFound, redirect } from "next/navigation";
import { getRecapSeasons } from "@/lib/queries";
import { recapTarget, seasonSlug } from "@/lib/seasons";

// /recap → the current season once it's complete, else the most recent
// complete season, else the in-progress current season.
export default async function RecapRedirect() {
  const target = recapTarget(await getRecapSeasons(), new Date().toISOString().slice(0, 10));
  if (!target) notFound();
  redirect(`/seasons/${seasonSlug(target.name)}/recap`);
}
