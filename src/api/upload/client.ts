"use client";
import "client-only";
import { APIFetch_C } from "../utils/fetching";
import { AdminFileInfoOption, FileInfo } from "./server";

/**
 * Uploads a file to a Verifiable document constraint.
 * @param {string} slug - The verifiable slug.
 * @param {number} docId - The document ID.
 * @param {string} constraintName - The constraint name.
 * @param {File} file - The file to upload.
 * @returns {Promise<string>} The ID/path of the uploaded file.
 */
export async function uploadFileToVerifiable_C(
    slug: string,
    docId: number,
    constraintName: string,
    file: File
) {
    const formData = new FormData();
    formData.append("file", file);
    return await APIFetch_C<string>(
        `/upload/verifiable`,
        "POST",
        {
            slug: slug,
            doc_id: docId.toString(),
            constraint_name: constraintName,
        },
        formData
    );
}

/**
 * Uploads a file to a Submission constraint.
 * @param {number} verifiableDocId - The verifiable doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {string} constraintName - The constraint name.
 * @param {File} file - The file to upload.
 * @returns {Promise<string>} The ID/path of the uploaded file.
 */
export async function uploadFileToSubmission_C(
    verifiableDocId: number,
    submittableSlug: string,
    constraintName: string,
    file: File
) {
    const formData = new FormData();
    formData.append("file", file);
    return await APIFetch_C<string>(
        `/upload/submission`,
        "POST",
        {
            verifiable_doc_id: verifiableDocId.toString(),
            submittable_slug: submittableSlug,
            constraint_name: constraintName,
        },
        formData
    );
}

/**
 * Fetches file metadata and signed URL for a Verifiable document file.
 * @param {string} slug - The verifiable slug.
 * @param {number} docId - The doc ID.
 * @param {string} constraintName - The constraint name.
 * @param {AdminFileInfoOption} [adminOption] - Admin options.
 * @returns {Promise<FileInfo>} The file info.
 */
export async function getVerifiableFileInfo_C(
    slug: string,
    docId: number,
    constraintName: string,
    adminOption?: AdminFileInfoOption
): Promise<FileInfo> {
    const queryObj: Record<string, string> = {
        slug: slug,
        doc_id: docId.toString(),
        constraint_name: constraintName,
    };
    if (adminOption) {
        queryObj.admin_option = JSON.stringify(adminOption);
    }
    return await APIFetch_C<FileInfo>(`/upload/verifiable`, "GET", queryObj);
}

/**
 * Fetches file metadata and signed URL for a Submission file.
 * @param {number} verifiableDocId - The verifiable doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {string} constraintName - The constraint name.
 * @param {number} level - The level.
 * @param {AdminFileInfoOption} [adminOption] - Admin options.
 * @returns {Promise<FileInfo>} The file info.
 */
export async function getSubmissionFileInfo_C(
    verifiableDocId: number,
    submittableSlug: string,
    constraintName: string,
    level: number,
    adminOption?: AdminFileInfoOption
): Promise<FileInfo> {
    const queryObj: Record<string, string> = {
        verifiable_doc_id: verifiableDocId.toString(),
        submittable_slug: submittableSlug,
        constraint_name: constraintName,
        level: level.toString(),
    };
    if (adminOption) {
        queryObj.admin_option = JSON.stringify(adminOption);
    }
    return await APIFetch_C<FileInfo>(`/upload/submission`, "GET", queryObj);
}
