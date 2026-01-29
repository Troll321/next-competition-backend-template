import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    experimental: {
        staticGenerationRetryCount: 1,
        staticGenerationMaxConcurrency: 1,
        staticGenerationMinPagesPerWorker: 1000,
    },
};

export default withPayload(nextConfig);
