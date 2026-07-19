// import "server-only";
import { getPayload } from "payload";
import config from "@payload-config";

export const runtime = "nodejs";

const cachedPayload: {
    client?: Awaited<ReturnType<typeof getPayload>>;
    promise?: ReturnType<typeof getPayload>;
} = {};

export async function getPayloadClient_S() {
    if (cachedPayload.client) {
        return cachedPayload.client;
    }

    if (!cachedPayload.promise) {
        if (process.env.NODE_ENV !== "production") {
            console.log("INITIALIZING PAYLOAD!");
        }
        cachedPayload.promise = getPayload({
            config,
        });
    }

    cachedPayload.client = await cachedPayload.promise;
    return cachedPayload.client;
}
