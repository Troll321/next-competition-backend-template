import "server-only";
import { FileMetadata, StorageAdapter } from "./server";
import { decodeFilePath_SC, encodeFilePath_SC } from "../utils/string";
import { google } from "googleapis";
import { Readable } from "stream";
import { UploadError, UploadErrorEnum } from "../errorHandler/class";

export const runtime = "nodejs";

export class GDriveAdapter implements StorageAdapter {
    drive;
    driveId;

    async uploadFile_S(userId: string, file: File): Promise<string> {
        const res = await this.drive.files.create({
            requestBody: {
                name: encodeFilePath_SC(userId, file),
                mimeType: file.type,
                parents: [this.driveId],
                driveId: this.driveId,
            },
            media: {
                mimeType: file.type,
                body: Readable.from(Buffer.from(await file.arrayBuffer())),
            },
            supportsAllDrives: true,
            fields: "id",
        });

        if (!res.data.id) {
            throw new UploadError(UploadErrorEnum.ThirdPartyError);
        }
        return encodeFilePath_SC(userId, file, res.data.id!);
    }

    async getFileMetadata_S(path: string): Promise<FileMetadata> {
        const res = await this.drive.files.get({
            fileId: decodeFilePath_SC(path).adapterMeta!,
            supportsAllDrives: true,
        });

        return {
            name: res.data.name,
            MIMEType: res.data.mimeType,
            size: res.data.size,
        } as FileMetadata;
    }

    async getDownloadableURL_S(path: string): Promise<string> {
        const res = await this.drive.files.get({
            fileId: decodeFilePath_SC(path).adapterMeta!,
            supportsAllDrives: true,
            fields: "webViewLink",
        });
        return res.data.webViewLink!;
    }

    async deleteFile_S(path: string): Promise<void> {
        await this.drive.files.delete({
            fileId: decodeFilePath_SC(path).adapterMeta!,
            supportsAllDrives: true,
        });
    }

    constructor() {
        const authClient = new google.auth.OAuth2({
            client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
            client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        });

        authClient.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN! });

        this.driveId = process.env.GOOGLE_SHARED_DRIVE_ID!;
        this.drive = google.drive({ version: "v3", auth: authClient });
    }
}
