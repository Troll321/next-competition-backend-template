import "server-only";
import {
    ExpectedAuthError,
    ExpectedAuthErrorEnum,
    FormError,
    FormErrorEnum,
    SubmissionError,
    SubmissionErrorEnum,
    UploadError,
    UploadErrorEnum,
} from "../errorHandler/class";
import { SupabaseAdapter } from "./supabaseAdapter";
import { getVerifiable_S, readDoc_S, updateDoc_S } from "../form/server";
import { getSubmission_S, getSubmittable_S, updateSubmission_S } from "../submission/server";
import { decodeSQLURL_SC, encodeSQLURL_SC } from "../utils/string";
import { getCollection_S, getMongoDB_S } from "../utils/getMongodb";
import { Db } from "mongodb";
import { getValidUser_S, isAdmin_S } from "../authentication/server";
import { GDriveAdapter } from "./gdriveAdapter";

export interface StorageAdapter {
    uploadFile_S(uId: string, file: File): Promise<string>;
    getFileMetadata_S(path: string): Promise<FileMetadata>;
    getDownloadableURL_S(path: string): Promise<string>;
    deleteFile_S(path: string): Promise<void>;
}

export interface FileMetadata {
    name: string;
    size?: number | undefined;
    MIMEType?: string | undefined;
    metadata?: Record<string, any> | undefined;
}

export interface FileInfo extends FileMetadata {
    signedUrl: string;
}

export interface AdminFileInfoOption {
    allowRead: boolean;
}

const db: Db = (await getMongoDB_S()).db(process.env.MONGODB_DBNAME!);

/**
 * The object key can be different from supplied bucketId but all should be unique
 * Please use safe name (alphanumeric lowercase underscore)
 */
const adapters: Record<string, StorageAdapter> = {
    supabase: new SupabaseAdapter("mystorage"),
    gdrive: new GDriveAdapter(),
};

async function uploadFile_S(uId: string, file: File): Promise<string> {
    const adapter = "gdrive"; // Choose the adapter to use
    return encodeSQLURL_SC(adapter, await adapters[adapter].uploadFile_S(uId, file));
}

async function getFileMetadata_S(sqlUrl: string): Promise<FileMetadata> {
    const { adapter, path } = decodeSQLURL_SC(sqlUrl);
    return await adapters[adapter].getFileMetadata_S(path);
}

async function getDownloadableURL_S(sqlUrl: string): Promise<string> {
    // Get signed url from db first
    const collection = await getCollection_S("signed_urls", db);
    const oldSignedUrl = await collection.findOne(
        { sqlUrl: sqlUrl },
        { projection: { _id: 0, __v: 0 } }
    );

    // Check also if expired or not
    if (
        oldSignedUrl &&
        Date.now() <
            (oldSignedUrl.expired as Date).getTime() -
                parseInt(process.env.UPLOAD_SIGNED_URL_EXPIRE_OFFSET_S!) * 1000
    ) {
        return oldSignedUrl.signedUrl;
    }

    // Is always not NaN, if .env setting is right
    const expiresSecond = parseInt(process.env.NEXT_PUBLIC_UPLOAD_SIGNED_URL_EXPIRE_S!);

    const { adapter, path } = decodeSQLURL_SC(sqlUrl);
    const newSignedUrl = await adapters[adapter].getDownloadableURL_S(path);

    await collection.replaceOne(
        {
            sqlUrl: sqlUrl,
        },
        {
            sqlUrl: sqlUrl,
            signedUrl: newSignedUrl,
            expired: new Date(Date.now() + expiresSecond * 1000),
        },
        { upsert: true }
    );

    return newSignedUrl;
}

/**
 * Deletes a file from the storage adapter and removes its signed URL record.
 * @param {string} sqlUrl - The encoded SQL URL of the file.
 * @param {boolean} [_isFromServer=false] - (Internal Backend Only) Authorization bypass flag. Use carefully.
 * @returns {Promise<void>}
 * @throws {UploadError} If not authorized (NotAllowed).
 */
export async function deleteFile_S(sqlUrl: string, _isFromServer: boolean = false) {
    if (!_isFromServer) {
        throw new UploadError(UploadErrorEnum.NotAllowed);
    }
    const { adapter, path } = decodeSQLURL_SC(sqlUrl);
    await adapters[adapter].deleteFile_S(path);

    // Revalidate signed_urls
    const collection = await getCollection_S("signed_urls", db);
    await collection.deleteOne({ sqlUrl: sqlUrl });
}

/**
 * Uploads a file for a Verifiable document constraint.
 * @param {string} slug - The verifiable slug.
 * @param {number} docId - The document ID.
 * @param {string} constraintName - The constraint name.
 * @param {File} file - The file to upload.
 * @returns {Promise<string>} The encoded SQL URL of the uploaded file.
 * @throws {FormError} If doc not found, verified, or constraint invalid.
 */
export async function uploadFileToVerifiable_S(
    slug: string,
    docId: number,
    constraintName: string,
    file: File
) {
    const user = (await getValidUser_S(undefined, undefined))!;
    const doc = (await readDoc_S(slug, { id: docId }, undefined, user))[0];
    if (!doc) {
        throw new FormError(FormErrorEnum.DocumentNotFound);
    }
    if (doc.verified >= 1) {
        throw new FormError(FormErrorEnum.NotAllowed);
    }
    const { constraints, required_on_create } = await getVerifiable_S(slug);
    const allArr = [...constraints];
    if (required_on_create) {
        allArr.push(...required_on_create);
    }

    // Check constraint name
    let valid = false;
    for (let i = 0; i < allArr.length; i++) {
        const nowCons = allArr[i];
        if (
            nowCons.name === constraintName &&
            nowCons.type === "file" &&
            nowCons.mime_type.includes(file.type) &&
            nowCons.max_input_size_kb * 1024 >= file.size
        ) {
            valid = true;
            break;
        }
    }

    if (!valid) {
        throw new FormError(FormErrorEnum.InvalidInput, "file");
    }

    const insertObj: Record<string, string> = {};
    insertObj[constraintName] = await uploadFile_S(user.email!, file);
    try {
        await updateDoc_S(slug, insertObj, { id: docId }, undefined, true);
    } catch (err) {
        await deleteFile_S(insertObj[constraintName], true);
        throw err;
    }
    if (typeof doc[constraintName] === "string") {
        await deleteFile_S(doc[constraintName], true);
    }
    return insertObj[constraintName];
}

/**
 * Uploads a file for a Submission constraint.
 * @param {number} verifiableDocId - The verifiable doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {string} constraintName - The constraint name.
 * @param {File} file - The file to upload.
 * @returns {Promise<string>} The encoded SQL URL.
 * @throws {FormError} If doc not found.
 * @throws {SubmissionError} If locked or constraint invalid.
 */
export async function uploadFileToSubmission_S(
    verifiableDocId: number,
    submittableSlug: string,
    constraintName: string,
    file: File
) {
    const submittable = await getSubmittable_S(submittableSlug);
    const user = (await getValidUser_S(undefined, undefined))!;

    const verifiableSlug = submittable.verifiable;
    const doc = await /** rdcCountOpt */ readDoc_S(
        verifiableSlug,
        { id: verifiableDocId },
        undefined,
        user,
        undefined,
        undefined,
        { count: true }
    );
    if (doc[0].length === 0) {
        throw new FormError(FormErrorEnum.DocumentNotFound);
    }

    const submission = await getSubmission_S(
        verifiableDocId,
        submittableSlug,
        undefined,
        undefined,
        true
    );
    // If submission doesn't exists it means we create new

    if (submission && submission.locked) {
        throw new SubmissionError(SubmissionErrorEnum.NotAllowed);
    }

    const nowLevel = submission ? submission.level : 1;
    const allArr = submittable.levels[nowLevel - 1].constraints;

    // Check constraint name
    let valid = false;
    for (let i = 0; i < allArr.length; i++) {
        const nowCons = allArr[i];
        if (
            nowCons.name === constraintName &&
            nowCons.type === "file" &&
            nowCons.mime_type.includes(file.type) &&
            nowCons.max_input_size_kb * 1024 >= file.size
        ) {
            valid = true;
            break;
        }
    }

    if (!valid) {
        throw new SubmissionError(SubmissionErrorEnum.InvalidInput, "file");
    }

    const insertObj: Record<string, string> = {};
    insertObj[constraintName] = await uploadFile_S(user.email!, file);
    await updateSubmission_S(verifiableDocId, submittableSlug, insertObj, undefined, true);
    if (submission && submission.levels[nowLevel - 1]) {
        const oldSqlUrl = submission.levels[nowLevel - 1].constraints[constraintName];
        if (typeof oldSqlUrl === "string") {
            await deleteFile_S(oldSqlUrl, true);
        }
    }
    return insertObj[constraintName];
}

/**
 * Retrieves file info (metadata + signed URL) for a Verifiable doc.
 * @param {string} slug - The verifiable slug.
 * @param {number} docId - The doc ID.
 * @param {string} constraintName - The constraint name.
 * @param {AdminFileInfoOption} [adminOption] - Admin options.
 * @returns {Promise<FileInfo>} The file info.
 * @throws {FormError} If doc not found or constraint invalid.
 */
export async function getVerifiableFileInfo_S(
    slug: string,
    docId: number,
    constraintName: string,
    adminOption?: AdminFileInfoOption
): Promise<FileInfo> {
    if (adminOption) {
        if (!(await isAdmin_S())) {
            throw new ExpectedAuthError(ExpectedAuthErrorEnum.NotAdmin);
        }
    }
    const doc = (
        await readDoc_S(slug, { id: docId }, undefined, undefined, adminOption?.allowRead)
    )[0];
    if (!doc) {
        throw new FormError(FormErrorEnum.DocumentNotFound);
    }
    const { constraints, required_on_create } = await getVerifiable_S(slug);
    const allArr = [...constraints];
    if (required_on_create) {
        allArr.push(...required_on_create);
    }

    // Check constraint name
    for (let i = 0; i < allArr.length; i++) {
        const nowCons = allArr[i];
        if (
            nowCons.name === constraintName &&
            nowCons.type === "file" &&
            typeof doc[constraintName] === "string"
        ) {
            return {
                signedUrl: await getDownloadableURL_S(doc[constraintName]),
                ...(await getFileMetadata_S(doc[constraintName])),
            };
        }
    }

    throw new FormError(FormErrorEnum.InvalidInput);
}

/**
 * Retrieves file info for a Submission.
 * @param {number} verifiableDocId - The doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {string} constraintName - The constraint name.
 * @param {number} level - The level index.
 * @param {AdminFileInfoOption} [adminOption] - Admin options.
 * @returns {Promise<FileInfo>} The file info.
 * @throws {SubmissionError} If submission not found or level invalid.
 */
export async function getSubmissionFileInfo_S(
    verifiableDocId: number,
    submittableSlug: string,
    constraintName: string,
    level: number,
    adminOption?: AdminFileInfoOption
): Promise<FileInfo> {
    if (adminOption) {
        if (!(await isAdmin_S())) {
            throw new ExpectedAuthError(ExpectedAuthErrorEnum.NotAdmin);
        }
    }
    const submittable = await getSubmittable_S(submittableSlug);

    const verifiableSlug = submittable.verifiable;
    const doc = await readDoc_S(
        verifiableSlug,
        { id: verifiableDocId },
        undefined,
        undefined,
        adminOption?.allowRead
    );
    if (doc.length === 0) {
        throw new FormError(FormErrorEnum.DocumentNotFound);
    }

    const submission = await getSubmission_S(
        verifiableDocId,
        submittableSlug,
        undefined,
        undefined,
        true
    );

    if (!submission) {
        throw new SubmissionError(SubmissionErrorEnum.SubmissionNotFound);
    }
    if (!submittable.levels[level - 1] || !submission.levels[level - 1]?.constraints) {
        throw new SubmissionError(SubmissionErrorEnum.InvalidInput, "level");
    }

    const allArr = submittable.levels[level - 1].constraints;
    const nowLevelSubmission = submission.levels[level - 1].constraints;

    // Check constraint name
    for (let i = 0; i < allArr.length; i++) {
        const nowCons = allArr[i];
        if (
            nowCons.name === constraintName &&
            nowCons.type === "file" &&
            typeof nowLevelSubmission[constraintName] === "string"
        ) {
            return {
                signedUrl: await getDownloadableURL_S(nowLevelSubmission[constraintName]),
                ...(await getFileMetadata_S(nowLevelSubmission[constraintName])),
            };
        }
    }
    throw new SubmissionError(SubmissionErrorEnum.InvalidInput);
}
