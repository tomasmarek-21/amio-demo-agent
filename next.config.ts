import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  assetPrefix: "/agent",
};

export default nextConfig;
