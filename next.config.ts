import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A parent package-lock.json exists under C:\Users\user, so Next.js can
  // otherwise infer the wrong workspace and make Turbopack watch that folder.
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        source: "/employees",
        destination: "/settings/employees",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
