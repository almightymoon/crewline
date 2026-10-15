import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [{ source: "/", destination: "/spa.html" }];
  },
};

export default nextConfig;
