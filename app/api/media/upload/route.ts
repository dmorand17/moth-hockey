import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { checkUploadRequest, MEDIA_TYPES, maxBytesForPath } from "@/lib/media";
import { handleMediaUpload } from "@/lib/storage";

// Hands out Vercel Blob client-upload tokens for recap media — admins only,
// and only for paths under the season's prefix.
class Forbidden extends Error {}

export async function POST(request: NextRequest) {
  // Reject non-admins before touching Blob at all.
  const session = await getAuthSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const body = await request.json();
  try {
    const result = await handleMediaUpload(request, body, async (pathname, clientPayload) => {
      const { slug } = JSON.parse(clientPayload ?? "{}") as { slug?: string };
      const check = checkUploadRequest({
        isAdmin: true,
        pathname,
        slug: slug ?? "",
        vercelEnv: process.env.VERCEL_ENV,
      });
      if (!check.ok) throw new Forbidden(check.error);
      return { allowedContentTypes: [...MEDIA_TYPES], maximumSizeInBytes: maxBytesForPath(pathname) };
    });
    return NextResponse.json(result);
  } catch (e) {
    const forbidden = e instanceof Forbidden;
    if (!forbidden) console.error("media upload token failed", e);
    return NextResponse.json({ error: forbidden ? e.message : "Upload failed." }, { status: forbidden ? 403 : 400 });
  }
}
