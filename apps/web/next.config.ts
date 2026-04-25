import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@3dagent/shared"],
  devIndicators: false,
};

export default nextConfig;
