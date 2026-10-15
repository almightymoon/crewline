import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  eslint: {
    // Generated Prisma client and public SPA assets trip lint during Vercel builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
