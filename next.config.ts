import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  assetPrefix: "/agent",
  async rewrites() {
    // When deployed standalone (Railway), the browser requests /agent/_next/...
    // but Next.js only serves /_next/... — this rewrite bridges the gap.
    return [
      { source: "/agent/_next/:path*", destination: "/_next/:path*" },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [{ key: "X-Frame-Options", value: "ALLOWALL" }],
      },
    ];
  },
};

export default nextConfig;
