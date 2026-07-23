import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Public booking supports one optional 10MB image plus multipart form
      // overhead. File type and exact size are still enforced in the action.
      bodySizeLimit: "11mb",
    },
  },
  images: {
    remotePatterns: []
  }
};

export default nextConfig;
