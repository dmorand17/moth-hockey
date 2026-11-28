import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "192.168.4.35"],
  images: {
    // Recap media in the Vercel Blob store.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
  async redirects() {
    // The Teams list duplicated Standings; old links land there (query string,
    // e.g. ?season=, is passed through). Team pages stay at /teams/[slug].
    return [{ source: "/teams", destination: "/standings", permanent: true }];
  },
};

export default nextConfig;
