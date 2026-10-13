import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
