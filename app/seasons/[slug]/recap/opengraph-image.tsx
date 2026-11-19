import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getSeasonRecap } from "@/lib/queries";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "M.O.T.H Hockey season recap";

// Link preview for the group chat: banner art, season name and champion.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recap = await getSeasonRecap(slug);
  const banner = await readFile(join(process.cwd(), "public/moth-banner-strip.png"));
  const champion = recap?.championTeamId ? recap.teams.get(recap.championTeamId) : undefined;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 40, padding: 64, background: "#0b0d10", color: "#f4f6f8" }}>
        <img src={`data:image/png;base64,${banner.toString("base64")}`} width={600} height={216} alt="" style={{ borderRadius: 12 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 30, color: "#9aa3b2", letterSpacing: 2, textTransform: "uppercase" }}>Season recap</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1 }}>{recap?.season.name ?? "M.O.T.H Hockey"}</div>
          {champion && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 40, marginTop: 8 }}>
              <div style={{ width: 10, height: 44, borderRadius: 2, background: champion.color }} />
              <span style={{ color: "#fbbf24" }}>Champions:</span>
              <span>{champion.name}</span>
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
