import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /embed/* is meant to be iframed by any integrator site (headless lending widget).
  async headers() {
    return [{ source: "/embed/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
