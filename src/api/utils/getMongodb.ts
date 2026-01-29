import "server-only";
import { Db, MongoClient } from "mongodb";

export const runtime = "nodejs";

const cachedMongo: {
    client?: MongoClient;
    promise?: Promise<MongoClient>;
} = {};

export async function getMongoDB_S() {
    if (cachedMongo.client) {
        return cachedMongo.client;
    }

    if (!cachedMongo.promise) {
        if (process.env.NODE_ENV !== "production") {
            console.log("CONNECT TO MONGODB!");
        }
        cachedMongo.promise = new MongoClient(process.env.MONGODB_URL!, {}).connect();
    }

    cachedMongo.client = await cachedMongo.promise;
    return cachedMongo.client;
}

export async function getCollection_S(submittableSlug: string, myDb: Db) {
    const collection = myDb.collection(submittableSlug);
    try {
        if (!(await collection.indexExists("verifiableIdIDX"))) {
            await collection.createIndex({ verifiableId: 1 }, { name: "verifiableIdIDX" });
        }
    } catch {
        await myDb.createCollection(submittableSlug);
        await collection.createIndex({ verifiableId: 1 }, { name: "verifiableIdIDX" });
    }
    return collection;
}
