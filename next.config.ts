import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@univerjs/presets",
    "@univerjs/preset-sheets-core",
  ],
};

export default nextConfig;
