import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@3dagent/shared"],
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
