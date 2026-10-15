import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["@prisma/client", "prisma"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
