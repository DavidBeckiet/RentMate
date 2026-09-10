import { join } from "node:path";
import type { NextConfig } from "next";
import { validateProductionApiBaseForEnvironment } from "./lib/config/production-api-base";

validateProductionApiBaseForEnvironment(process.env);

const repositoryRoot = join(import.meta.dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repositoryRoot,
  transpilePackages: ["@rentmate/service-shared"],
  turbopack: {
    root: repositoryRoot
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com"
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      },
      {
        protocol: "https",
        hostname: "placehold.co"
      }
    ]
  }
};

export default nextConfig;
