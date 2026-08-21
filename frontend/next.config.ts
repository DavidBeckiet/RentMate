import type { NextConfig } from "next";
import { validateProductionApiBaseForEnvironment } from "./lib/config/production-api-base";

validateProductionApiBaseForEnvironment(process.env);

const nextConfig: NextConfig = {
  outputFileTracingRoot: import.meta.dirname,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com"
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      }
    ]
  }
};

export default nextConfig;
