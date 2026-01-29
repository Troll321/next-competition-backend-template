"use client";
import "client-only";
import {
    AdminFormDeleteOption,
    AdminFormReadOption,
    UnsanitizedFormInsert,
    UnsanitizedFormWhere,
} from "./server";
import { APIFetch_C } from "../utils/fetching";
import { Verifiable } from "../../../payload-types";
import { AdminSQLRow, SQLRow } from "../utils/sql";
import { verifiableLCache } from "../utils/localCaching";

/**
 * Fetches the Verifiable configuration from Payload CMS.
 * Uses local caching.
 * @param {string} slug - The verifiable slug.
 * @returns {Promise<Verifiable>} The verifiable configuration.
 */
export async function getVerifiable_C(slug: string) {
    slug = encodeURIComponent(slug);
    const cached = await verifiableLCache.get(slug);
    if (cached) {
        return cached;
    }
    const out = await APIFetch_C<Verifiable>(`/form/${slug}/constraints`, "GET");
    await verifiableLCache.cache(slug, out);
    return out;
}

/**
 * Creates a new Verifiable document.
 * @param {string} slug - The verifiable slug.
 * @param {UnsanitizedFormInsert} rawInsert - The data to insert.
 * @returns {Promise<void>}
 */
export async function createDoc_C(slug: string, rawInsert: UnsanitizedFormInsert) {
    slug = encodeURIComponent(slug);
    return await APIFetch_C<void>(`/form/${slug}`, "POST", undefined, {
        insert: rawInsert,
    });
}

export async function readDoc_C(
    slug: string,
    rawWhere: UnsanitizedFormWhere,
    adminOption?: undefined
): Promise<SQLRow[]>;

export async function readDoc_C(
    slug: string,
    rawWhere: UnsanitizedFormWhere,
    adminOption?: AdminFormReadOption
): Promise<AdminSQLRow[]>;

/**
 * Reads Verifiable document(s).
 * @param {string} slug - The verifiable slug.
 * @param {UnsanitizedFormWhere} rawWhere - Filtering conditions.
 * @param {AdminFormReadOption} [adminOption] - Admin options.
 * @returns {Promise<AdminSQLRow[] | SQLRow[]>} Array of documents.
 */
export async function readDoc_C(
    slug: string,
    rawWhere: UnsanitizedFormWhere,
    adminOption?: AdminFormReadOption
): Promise<AdminSQLRow[] | SQLRow[]> {
    slug = encodeURIComponent(slug);

    const queryObj: Record<string, string> = {
        where: JSON.stringify(rawWhere),
    };

    if (adminOption) {
        queryObj.admin_option = JSON.stringify(adminOption);
    }

    return APIFetch_C<AdminSQLRow[] | SQLRow[]>(`/form/${slug}`, "GET", queryObj);
}

/**
 * Updates a Verifiable document.
 * @param {string} slug - The verifiable slug.
 * @param {UnsanitizedFormInsert} rawInsert - The data to update.
 * @param {UnsanitizedFormWhere} rawWhere - The targeting condition (usually ID).
 * @returns {Promise<void>}
 */
export async function updateDoc_C(
    slug: string,
    rawInsert: UnsanitizedFormInsert,
    rawWhere: UnsanitizedFormWhere
) {
    slug = encodeURIComponent(slug);
    return APIFetch_C<void>(
        `/form/${slug}`,
        "PUT",
        { where: JSON.stringify(rawWhere) },
        {
            insert: rawInsert,
        }
    );
}

/**
 * Deletes a Verifiable document.
 * @param {string} slug - The verifiable slug.
 * @param {UnsanitizedFormWhere} rawWhere - The targeting condition.
 * @param {AdminFormDeleteOption} [adminOption] - Admin options (cascade).
 * @returns {Promise<void>}
 */
export async function deleteDoc_C(
    slug: string,
    rawWhere: UnsanitizedFormWhere,
    adminOption?: AdminFormDeleteOption
) {
    slug = encodeURIComponent(slug);

    const queryObj: Record<string, string> = {
        where: JSON.stringify(rawWhere),
    };

    if (adminOption) {
        queryObj.admin_option = JSON.stringify(adminOption);
    }

    return APIFetch_C<void>(`/form/${slug}`, "DELETE", queryObj);
}

/**
 * Requests verification for a document.
 * @param {string} slug - The verifiable slug.
 * @param {number} id - The document ID.
 * @returns {Promise<void>}
 */
export async function requestVerify_C(slug: string, id: number) {
    slug = encodeURIComponent(slug);
    const safeId = encodeURIComponent(id);
    return APIFetch_C<void>(`/form/${slug}/${safeId}`, "PUT");
}

/**
 * Updates document sharing permissions.
 * @param {string} slug - The verifiable slug.
 * @param {number} id - The document ID.
 * @param {string[]} share - Emails to share with.
 * @param {string[]} unshare - Emails to remove sharing from.
 * @returns {Promise<void>}
 */
export async function shareDoc_C(slug: string, id: number, share: string[], unshare: string[]) {
    slug = encodeURIComponent(slug);
    const safeId = encodeURIComponent(id);
    return APIFetch_C<void>(`/form/${slug}/${safeId}`, "POST", undefined, {
        share,
        unshare,
    });
}

/**
 * Checks if a specific accessor (email) has a verified document in the given slug.
 * @param {string} slug - The verifiable slug.
 * @param {string} accessor - The email to check.
 * @returns {Promise<number | null>} The document ID if verified, else null.
 */
export async function isAccessorVerified_C(slug: string, accessor: string) {
    slug = encodeURIComponent(slug);
    return APIFetch_C<number | null>(`/form/${slug}/is_verified`, "GET", { accessor });
}

/**
 * Joins a shared document using a code.
 * @param {string} fullVerifiableCode - The full code (e.g. "XX.YYYY").
 * @returns {Promise<void>}
 */
export async function joinWithVerifiableCode_C(fullVerifiableCode: string) {
    return APIFetch_C<void>(`/form/join`, "POST", {}, { fullVerifiableCode });
}

/**
 * Verifies or rejects a document (Admin only).
 * @param {string} slug - The verifiable slug.
 * @param {number} id - The document ID.
 * @param {boolean} verdict - True to verify, False to reject.
 * @param {string} messageSubject - Feedback subject.
 * @param {string} messageBody - Feedback body.
 * @returns {Promise<void>}
 */
export async function verifyDoc_C(
    slug: string,
    id: number,
    verdict: boolean,
    messageSubject: string,
    messageBody: string
) {
    slug = encodeURIComponent(slug);
    const safeId = encodeURIComponent(id);

    return APIFetch_C<void>(`/form/${slug}/${safeId}/verify`, "POST", undefined, {
        verdict,
        message_subject: messageSubject,
        message_body: messageBody,
    });
}

/**
 * Sends a message/feedback to document owner (Admin only).
 * @param {string} slug - The verifiable slug.
 * @param {number} id - The document ID.
 * @param {string} messageSubject - Message subject.
 * @param {string} messageBody - Message body.
 * @param {boolean} sendEmail - Whether to dispatch email.
 * @returns {Promise<void>}
 */
export async function sendMessageToVerifiable_C(
    slug: string,
    id: number,
    messageSubject: string,
    messageBody: string,
    sendEmail: boolean
) {
    slug = encodeURIComponent(slug);
    const safeId = encodeURIComponent(id);

    return APIFetch_C<void>(`/form/${slug}/${safeId}/message`, "POST", undefined, {
        message_subject: messageSubject,
        message_body: messageBody,
        sendEmail,
    });
}
