import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@spy-copilot/shared"],
  experimental: {
    cpus: 4,
  },
  outputFileTracingRoot: resolve(__dirname, "../.."),
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@spy-copilot/server/**",
      "node_modules/@spy-copilot/web/**",
      "apps/server/**",
      "apps/web/.next/**",
    ],
  },
};

export default nextConfig;
