import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the local kv workspace package
  transpilePackages: ["kv"],
};

export default nextConfig;
