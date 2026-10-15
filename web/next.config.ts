import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    // Serve the SPA as a pure static file — no Node serverless function for /
    return [{ source: "/", destination: "/spa.html" }];
  },
};

export default nextConfig;
