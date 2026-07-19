// import "server-only";
import { Submittable, Verifiable } from "@root/payload-types";
import { SQLRow } from "./sql";
import { Submission } from "../submission/server";
import { getRedis_S } from "./getRedis";
import { getMongoDB_S, getVersionCollection_S } from "./getMongodb";

const prefix = {
    accessor: "a_",
    verifiable: "v_",
    submittable: "s_",
    doc: "d_",
    submission: "b_",
    version: "c_",
};

let redis: Awaited<ReturnType<typeof getRedis_S>>;
const useCacheOn: Record<string, boolean> = {};
let shouldConnect = false;
process.env.USE_CACHING!.split(";").forEach((val) => {
    if(Object.keys(prefix).includes(val)) {
        shouldConnect = true;
    }
    useCacheOn[val] = true;
});
if(shouldConnect) {redis = await getRedis_S();}

function encodeObj(obj: any) {
    return JSON.stringify(obj);
}

async function hash(str: string) {
    return str;
    // return base64UrlEncode_SC(
    //     String.fromCharCode(
    //         ...Array.from(
    //             new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)))
    //         )
    //     )
    // );
}

function logCache(type: string, item: any) {
    if (process.env.LOG_CACHE !== "true") {
        return;
    }
    if (item) {
        console.log("CACHE HIT! : " + type);
    } else {
        console.log("CACHE MISS! : " + type);
    }
}

interface VersionDocument {
    type: "verifiable" | "submittable";
    slug: string;
    version: number;
}

export async function gCacheVersion_S(
    type: VersionDocument["type"],
    slug: string
): Promise<number | undefined> {
    if (!useCacheOn["version"]) {
        return undefined;
    }

    const out = await redis.get(prefix.version + type + "-" + slug);
    logCache("version", out);
    return out ? JSON.parse(out) : undefined;
}

export async function sCacheVersion_S(
    version: number | null,
    type: VersionDocument["type"],
    slug: string
): Promise<void> {
    if (!useCacheOn["version"]) {
        return;
    }

    if (!version) {
        await redis.unlink(prefix.version + type + "-" + slug);
        return;
    }
    await redis.set(prefix.version + type + "-" + slug, encodeObj(version));
}

async function getVersionNumber(type: VersionDocument["type"], slug: string): Promise<number> {
    const cacheOut = await gCacheVersion_S(type, slug);
    if (cacheOut !== undefined) {
        return cacheOut;
    }

    const db = (await getMongoDB_S()).db(process.env.MONGODB_DBNAME!);
    const collection = await getVersionCollection_S(db);
    const hasil = await collection.findOne<VersionDocument>({ type, slug });
    if (!hasil) {
        await collection.updateOne(
            { type, slug },
            { $set: { type, slug, version: 1 } },
            { upsert: true }
        );
        await sCacheVersion_S(1, type, slug);
        return 1;
    }

    await sCacheVersion_S(hasil.version, type, slug);
    return hasil.version;
}

export async function incrementVersionNumber(
    type: VersionDocument["type"],
    slug: string,
    isDelete: boolean = false
): Promise<void> {
    const db = (await getMongoDB_S()).db(process.env.MONGODB_DBNAME!);
    const collection = await getVersionCollection_S(db);
    await sCacheVersion_S(null, type, slug);

    if (isDelete) {
        await collection.deleteOne({ type, slug });
    } else {
        await collection.updateOne({ type, slug }, { $inc: { version: 1 } }, { upsert: true });
    }
}

async function encodeDocCParam(slug: string, accessor: string) {
    return (
        (await getVersionNumber("verifiable", slug)).toString() +
        prefix.doc +
        (await hash(
            JSON.stringify({
                slug,
                accessor,
            })
        ))
    );
}

async function encodeSubmissionCParam(verifiableDocId: number, submittableSlug: string) {
    return (
        (await getVersionNumber("submittable", submittableSlug)).toString() +
        prefix.submission +
        (await hash(
            JSON.stringify({
                verifiableDocId,
                submittableSlug,
            })
        ))
    );
}

export async function gCacheAccessor_S(
    email: string,
    slug: string
): Promise<number | null | undefined> {
    if (!useCacheOn["accessor"]) {
        return undefined;
    }

    const out = await redis.get(prefix.accessor + slug + "-" + email);
    logCache("accessor", out);
    return out ? JSON.parse(out) : undefined;
}

export async function sCacheAccessor_S(
    verified: number | null,
    slug: string,
    accessor: string[]
): Promise<void> {
    if (!useCacheOn["accessor"]) {
        return;
    }

    accessor.forEach(async (nowAccessor) => {
        if (!verified) {
            await redis.unlink(prefix.accessor + slug + "-" + nowAccessor);
            return;
        }
        await redis.set(prefix.accessor + slug + "-" + nowAccessor, encodeObj(verified));
    });
}

export async function gCacheVerifiable_S(slug: string): Promise<Verifiable | undefined> {
    if (!useCacheOn["verifiable"]) {
        return undefined;
    }

    const out = await redis.get(prefix.verifiable + slug);
    logCache("verifiable", out);
    return out ? JSON.parse(out) : undefined;
}

export async function sCacheVerifiable_S(
    verifiable: Verifiable | null,
    slug: string
): Promise<void> {
    if (!useCacheOn["verifiable"]) {
        return;
    }

    if (!verifiable) {
        await redis.unlink(prefix.verifiable + slug);
        return;
    }
    await redis.set(prefix.verifiable + slug, encodeObj(verifiable));
}

export async function gCacheSubmittable_S(
    submittableSlug: string
): Promise<Submittable | undefined> {
    if (!useCacheOn["submittable"]) {
        return undefined;
    }

    const out = await redis.get(prefix.submittable + submittableSlug);
    logCache("submittable", out);
    return out ? JSON.parse(out) : undefined;
}

export async function sCacheSubmittable_S(
    submittable: Submittable | null,
    submittableSlug: string
): Promise<void> {
    if (!useCacheOn["submittable"]) {
        return undefined;
    }

    if (!submittable) {
        await redis.unlink(prefix.submittable + submittableSlug);
        return;
    }
    await redis.set(prefix.submittable + submittableSlug, encodeObj(submittable));
}

export async function gCacheDoc_S(slug: string, accessor: string): Promise<SQLRow[] | undefined> {
    if (!useCacheOn["doc"]) {
        return undefined;
    }

    const out = await redis.get(await encodeDocCParam(slug, accessor));
    logCache("doc", out);
    return out ? JSON.parse(out) : undefined;
}

export async function sCacheDoc_S(
    sqlRow: SQLRow[] | null,
    slug: string,
    accessor: string[]
): Promise<void> {
    if (!useCacheOn["doc"]) {
        return;
    }

    accessor.forEach(async (nowAccessor) => {
        const key = await encodeDocCParam(slug, nowAccessor);
        if (!sqlRow) {
            await redis.unlink(key);
            return;
        }

        await redis.set(key, encodeObj(sqlRow));
    });
}

export async function gCacheSubmission_S(
    verifiableDocId: number,
    submittableSlug: string
): Promise<Submission | undefined> {
    if (!useCacheOn["submission"]) {
        return undefined;
    }

    const out = await redis.get(await encodeSubmissionCParam(verifiableDocId, submittableSlug));
    logCache("submission", out);
    return out ? JSON.parse(out) : undefined;
}

export async function sCacheSubmission_S(
    submission: Submission | null,
    verifiableDocId: number,
    submittableSlug: string
): Promise<void> {
    if (!useCacheOn["submission"]) {
        return;
    }

    if (!submission) {
        await redis.unlink(await encodeSubmissionCParam(verifiableDocId, submittableSlug));
        return;
    }
    await redis.set(
        await encodeSubmissionCParam(verifiableDocId, submittableSlug),
        encodeObj(submission)
    );
}