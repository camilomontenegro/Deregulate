import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    suppressHydrationWarning: true
  }
};

export default nextConfig;
