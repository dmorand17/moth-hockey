// Recap media rules (pure; shared by the upload route, server actions and UI).

const MB = 1024 * 1024;

export const MEDIA_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
];

// The picker leaves HEIC out so iOS converts camera-roll photos to JPEG.
export const PICKER_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,application/pdf";

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

// Production media lives under seasons/; local and preview uploads under dev/
// so test files never mix with real ones in the shared store.
export function mediaPrefix(slug: string, vercelEnv: string | undefined): string {
  return `${vercelEnv === "production" ? "" : "dev/"}seasons/${slug}/`;
}

export function maxBytesFor(contentType: string): number {
  return contentType.startsWith("video/") ? 200 * MB : 20 * MB;
}

export type MediaKind = "image" | "video" | "file";

// HEIC only renders in Safari, so it's listed as a file rather than shown.
export function mediaKind(contentType: string): MediaKind {
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/") && contentType !== "image/heic") return "image";
  return "file";
}

const underPrefix = (pathname: string, prefix: string) =>
  pathname.startsWith(prefix) && !pathname.split("/").includes("..");

export function checkUploadRequest(r: {
  isAdmin: boolean;
  pathname: string;
  slug: string;
  vercelEnv: string | undefined;
}): { ok: true } | { ok: false; error: string } {
  if (!r.isAdmin) return { ok: false, error: "Admins only." };
  if (!underPrefix(r.pathname, mediaPrefix(r.slug, r.vercelEnv))) return { ok: false, error: "Upload path is outside this season." };
  return { ok: true };
}

// A recorded URL must be an https Blob URL under this season's prefix.
export function validateMediaUrl(url: string, prefix: string): { ok: true; pathname: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, error: "Not a valid URL." };
  }
  if (u.protocol !== "https:" || !u.hostname.endsWith(BLOB_HOST_SUFFIX)) return { ok: false, error: "Not a media store URL." };
  const pathname = decodeURIComponent(u.pathname).replace(/^\//, "");
  if (!underPrefix(pathname, prefix)) return { ok: false, error: "Media is outside this season." };
  return { ok: true, pathname };
}

export function moveItem<T extends { id: string }>(items: T[], id: string, dir: -1 | 1): T[] {
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function stepIndex(i: number, dir: -1 | 1, length: number): number {
  return (i + dir + length) % length;
}

// A left swipe (negative dx) goes to the next item.
export function swipeDir(dx: number, dy: number): -1 | 1 | 0 {
  if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

export function formatBytes(n: number): string {
  if (n < MB) return `${Math.round(n / 1024)} KB`;
  return `${(n / MB).toFixed(1)} MB`;
}
