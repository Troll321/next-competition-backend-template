import "server-only";
import { createClient } from "@supabase/supabase-js";
import { FileMetadata, StorageAdapter } from "./server";
import { encodeFilePath_SC } from "../utils/string";

export class SupabaseAdapter implements StorageAdapter {
    supabase;
    bucketId: string;

    async #init() {
        const { error } = await this.supabase.storage.getBucket(this.bucketId);
        //@ts-ignore status property exists, trust me
        if (error?.name === "StorageApiError" && error?.statusCode === "404") {
            // Create the bucket if not exists
            const { error } = await this.supabase.storage.createBucket(this.bucketId, {
                public: false,
            });
            if (error !== null) {
                throw error;
            }
        } else {
            throw error;
        }
    }

    async uploadFile_S(userId: string, file: File): Promise<string> {
        const path = encodeFilePath_SC(userId, file);
        const { data, error } = await this.supabase.storage.from(this.bucketId).upload(path, file, {
            upsert: true,
        });
        if (error) {
            throw error;
        }

        return data.path;
    }

    async getFileMetadata_S(path: string): Promise<FileMetadata> {
        const { data, error } = await this.supabase.storage.from(this.bucketId).info(path);
        if (error) {
            throw error;
        }

        return {
            name: data.name,
            size: data.size,
            MIMEType: data.contentType,
            metadata: data.metadata,
        };
    }

    async getDownloadableURL_S(path: string): Promise<string> {
        // Is always not NaN, if .env setting is right
        const expiresSecond = parseInt(process.env.NEXT_PUBLIC_UPLOAD_SIGNED_URL_EXPIRE_S!);

        const { data, error } = await this.supabase.storage
            .from(this.bucketId)
            .createSignedUrl(path, expiresSecond);
        if (error) {
            throw error;
        }

        return data.signedUrl;
    }

    async deleteFile_S(path: string): Promise<void> {
        const { data, error } = await this.supabase.storage.from(this.bucketId).remove([path]);

        if (error) {
            throw error;
        }
    }

    constructor(bucketId: string) {
        this.supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET!);
        this.bucketId = bucketId;
        this.#init();
    }
}
