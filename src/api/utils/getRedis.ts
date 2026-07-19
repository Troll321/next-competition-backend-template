// import "server-only";
import { createClient } from "redis";

export const runtime = "nodejs";

const cachedRedis: {
    client?: ReturnType<typeof createClient>;
    promise?: ReturnType<typeof createClient>;
} = {};

export async function getRedis_S() {
    if (cachedRedis.client) {
        return cachedRedis.client;
    }

    if (!cachedRedis.promise) {
        if (process.env.NODE_ENV !== "production") {
            console.log("CONNECT TO REDIS!");
        }
        cachedRedis.promise = createClient({
            url: process.env.REDIS_URL,
        });
    }

    cachedRedis.client = await cachedRedis.promise.connect();
    return cachedRedis.client;
}