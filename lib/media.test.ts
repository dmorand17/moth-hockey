import { describe, expect, test } from "bun:test";
import {
  checkUploadRequest,
  clampPan,
  clampZoom,
  doubleTapZoom,
  mediaAspect,
  neighbors,
  pinchZoom,
  splitHero,
  lightboxGesture,
  maxBytesForPath,
  formatBytes,
  maxBytesFor,
  mediaKind,
  mediaPrefix,
  moveItem,
  stepIndex,
  swipeDir,
  validateMediaUrl,
} from "@/lib/media";

const MB = 1024 * 1024;
const HOST = "https://abc.public.blob.vercel-storage.com";

describe("paths and limits", () => {
  test("production uses seasons/, everything else dev/", () => {
    expect(mediaPrefix("spring-2026", "production")).toBe("seasons/spring-2026/");
    expect(mediaPrefix("spring-2026", "preview")).toBe("dev/seasons/spring-2026/");
    expect(mediaPrefix("spring-2026", undefined)).toBe("dev/seasons/spring-2026/");
  });
  test("200 MB for video, 20 MB otherwise", () => {
    expect(maxBytesFor("video/mp4")).toBe(200 * MB);
    expect(maxBytesFor("image/jpeg")).toBe(20 * MB);
    expect(maxBytesFor("application/pdf")).toBe(20 * MB);
  });
  test("HEIC and PDFs are files, not grid images", () => {
    expect(mediaKind("image/heic")).toBe("file");
    expect(mediaKind("image/webp")).toBe("image");
    expect(mediaKind("video/quicktime")).toBe("video");
    expect(mediaKind("application/pdf")).toBe("file");
  });
});

describe("checkUploadRequest", () => {
  const base = { slug: "spring-2026", vercelEnv: undefined, pathname: "dev/seasons/spring-2026/a.jpg" };
  test("non-admins are rejected", () => {
    expect(checkUploadRequest({ ...base, isAdmin: false }).ok).toBe(false);
  });
  test("pathname must sit under this season's prefix", () => {
    expect(checkUploadRequest({ ...base, isAdmin: true, slug: "fall-2025" }).ok).toBe(false);
    expect(checkUploadRequest({ ...base, isAdmin: true, pathname: "dev/seasons/spring-2026/../x.jpg" }).ok).toBe(false);
    expect(checkUploadRequest({ ...base, isAdmin: true }).ok).toBe(true);
  });
});

describe("validateMediaUrl", () => {
  const prefix = "dev/seasons/spring-2026/";
  test("accepts a blob URL under the prefix", () => {
    expect(validateMediaUrl(`${HOST}/dev/seasons/spring-2026/a-xyz.jpg`, prefix)).toEqual({ ok: true, pathname: "dev/seasons/spring-2026/a-xyz.jpg" });
  });
  test("rejects other schemes, hosts, prefixes and traversal", () => {
    for (const url of [
      "http://abc.public.blob.vercel-storage.com/dev/seasons/spring-2026/a.jpg",
      "https://evil.com/dev/seasons/spring-2026/a.jpg",
      `${HOST}/seasons/spring-2026/a.jpg`,
      `${HOST}/dev/seasons/fall-2025/a.jpg`,
      `${HOST}/dev/seasons/spring-2026/%2e%2e/fall-2025/a.jpg`,
      "not a url",
    ]) {
      expect(validateMediaUrl(url, prefix).ok).toBe(false);
    }
  });
});

describe("moveItem", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const ids = (x: { id: string }[]) => x.map((i) => i.id);
  test("moves within bounds", () => {
    expect(ids(moveItem(items, "a", 1))).toEqual(["b", "a", "c"]);
  });
  test("is a no-op at the ends", () => {
    expect(ids(moveItem(items, "a", -1))).toEqual(["a", "b", "c"]);
    expect(ids(moveItem(items, "c", 1))).toEqual(["a", "b", "c"]);
  });
});

describe("lightbox navigation", () => {
  test("stepIndex wraps", () => {
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(0);
  });
  test("swipeDir needs a mostly-horizontal 50px swipe", () => {
    expect(swipeDir(-80, 10)).toBe(1);
    expect(swipeDir(80, 10)).toBe(-1);
    expect(swipeDir(30, 0)).toBe(0);
    expect(swipeDir(60, 90)).toBe(0);
  });
});

test("formatBytes", () => {
  expect(formatBytes(524288)).toBe("512 KB");
  expect(formatBytes(3_565_158)).toBe("3.4 MB");
});

describe("lightbox input on videos", () => {
  test("swipes only count for touch, and never on a video", () => {
    expect(lightboxGesture({ kind: "swipe", pointerType: "touch", onVideo: false })).toBe(true);
    expect(lightboxGesture({ kind: "swipe", pointerType: "touch", onVideo: true })).toBe(false);
    expect(lightboxGesture({ kind: "swipe", pointerType: "mouse", onVideo: false })).toBe(false);
  });
  test("arrow keys belong to a focused video", () => {
    expect(lightboxGesture({ kind: "key", onVideo: true })).toBe(false);
    expect(lightboxGesture({ kind: "key", onVideo: false })).toBe(true);
  });
});

test("size cap comes from the file extension, not the claimed type", () => {
  expect(maxBytesForPath("dev/seasons/s/clip-abc.mp4")).toBe(200 * MB);
  expect(maxBytesForPath("dev/seasons/s/clip-abc.MOV")).toBe(200 * MB);
  expect(maxBytesForPath("dev/seasons/s/photo-abc.jpg")).toBe(20 * MB);
  expect(maxBytesForPath("dev/seasons/s/noext")).toBe(20 * MB);
});

describe("hero photo", () => {
  const m = (contentType: string, id: string) => ({ id, contentType });
  test("the first image is the hero; the rest keep their order", () => {
    const r = splitHero([m("video/mp4", "v"), m("image/jpeg", "a"), m("image/png", "b")]);
    expect(r.hero?.id).toBe("a");
    expect(r.rest.map((x) => x.id)).toEqual(["v", "b"]);
  });
  test("no images, no hero", () => {
    const r = splitHero([m("video/mp4", "v"), m("application/pdf", "p")]);
    expect(r.hero).toBeNull();
    expect(r.rest.map((x) => x.id)).toEqual(["v", "p"]);
  });
  test("HEIC is never the hero", () => {
    expect(splitHero([m("image/heic", "h")]).hero).toBeNull();
  });
  test("mediaAspect uses stored size, else 4:3", () => {
    expect(mediaAspect(1200, 900)).toEqual({ ratio: "1200 / 900", known: true });
    expect(mediaAspect(null, 900)).toEqual({ ratio: "4 / 3", known: false });
  });
});

describe("lightbox zoom and preload", () => {
  test("clampZoom keeps 1–4", () => {
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(9)).toBe(4);
  });
  test("double tap toggles 2.5× and back", () => {
    expect(doubleTapZoom(1)).toBe(2.5);
    expect(doubleTapZoom(2)).toBe(1);
  });
  test("pinch scales by finger distance, clamped", () => {
    expect(pinchZoom(1, 100, 250)).toBe(2.5);
    expect(pinchZoom(2, 100, 10)).toBe(1);
  });
  test("neighbors wrap and skip self", () => {
    expect(neighbors(0, 4)).toEqual([3, 1]);
    expect(neighbors(0, 1)).toEqual([]);
    expect(neighbors(0, 2)).toEqual([1]);
  });
});

test("clampPan keeps a zoomed photo on screen", () => {
  // 2x on a 400x300 stage: may move up to half the overflow each way.
  expect(clampPan(500, -500, 2, 400, 300)).toEqual({ x: 200, y: -150 });
  expect(clampPan(50, 20, 2, 400, 300)).toEqual({ x: 50, y: 20 });
  expect(clampPan(80, 80, 1, 400, 300)).toEqual({ x: 0, y: 0 });
});
