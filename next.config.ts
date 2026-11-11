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
  },
  // ffmpeg-static resolves its executable at runtime, so include it explicitly
  // in the serverless trace for the private MMS media worker.
  outputFileTracingIncludes: {
    "/api/cron/customer-message-media": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/twilio/inbound": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
