import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
    useCache: true,
    cacheLife: {
      // Stale-while-revalidate forever: serve stale content immediately,
      // revalidate in background, cache indefinitely until explicitly invalidated
      cms: {
        stale: Infinity,    // Serve stale content forever
        revalidate: 60,     // Revalidate in background every 60 seconds
        expire: Infinity,   // Never expire (rely on revalidateTag)
      },
    },
  },
};

export default nextConfig;
