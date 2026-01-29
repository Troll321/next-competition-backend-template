"use client";
import { Submittable, Verifiable } from "@root/payload-types";
import "client-only";

interface iSavedCache<T> {
    data: T;
    expireUnix: number;
}

export class LocalCaching_C<T> {
    keyPrefix: string;
    expiryS: number;

    // 8 Hours
    constructor(
        keyPrefix: string,
        expiryS: number = parseInt(process.env.NEXT_PUBLIC_LOCAL_CACHING_DEFAULT_TIME_S!)
    ) {
        this.keyPrefix = keyPrefix;
        this.expiryS = expiryS;
    }

    async get(requested: string) {
        const _out = await localStorage.getItem(`${this.keyPrefix}_${requested}`);
        let out: iSavedCache<T> | null = _out ? JSON.parse(_out) : null;
        if (out) {
            if (out.expireUnix < Date.now()) {
                await localStorage.removeItem(`${this.keyPrefix}_${requested}`);
                out = null;
            } else {
                return out.data;
            }
        }
        return out;
    }

    async cache(requested: string, data: any) {
        await localStorage.setItem(
            `${this.keyPrefix}_${requested}`,
            JSON.stringify({ expireUnix: Date.now() + this.expiryS * 1000, data })
        );
    }
}

export const verifiableLCache = new LocalCaching_C<Verifiable>("verfiable");
export const submittableLCache = new LocalCaching_C<Submittable>("submittable");
