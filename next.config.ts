import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    reactCompiler: true,
    compress: true,
    experimental: {
        turbopackFileSystemCacheForDev: true,
        optimizePackageImports: [
            "canvas-confetti",

            // CMS & UI Layers
            "@payloadcms/ui",
            "@payloadcms/next",

            // Auth & Misc Utility
            "@auth0/nextjs-auth0",
        ],
        optimizeCss: true,

        // staticGenerationRetryCount: 1,
        // staticGenerationMaxConcurrency: 1,
        // staticGenerationMinPagesPerWorker: 1000,
    },
    compiler: {
        removeConsole: process.env.NODE_ENV === "production",
        reactRemoveProperties: process.env.NODE_ENV === "production",
    },
};

export default withPayload(nextConfig);
