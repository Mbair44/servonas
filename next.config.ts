import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Rental inventory can include an 8 MB photo and a 10 MB receipt in the
      // same multipart form. Exact per-file limits are enforced in the UI and action.
      bodySizeLimit: "20mb",
    },
  },
  images: {
    remotePatterns: []
  }
};

export default nextConfig;
