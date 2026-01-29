"use client";
import "client-only";
import { APIFetch_C } from "../utils/fetching";

/**
 * Initiates or checks a payment for a Verifiable document.
 * @param {string} slug - The verifiable slug.
 * @param {number} docId - The doc ID.
 * @param {string} constraintName - The payment constraint name.
 * @param {boolean} checkOnly - Whether to only check status/expiration.
 * @returns {Promise<string>} The encoded payment info.
 */
export async function payToVerifiable_C(
    slug: string,
    docId: number,
    constraintName: string,
    checkOnly: boolean
) {
    return await APIFetch_C<string>(`/payment/verifiable`, "POST", {
        slug: slug,
        doc_id: docId.toString(),
        constraint_name: constraintName,
        check_only: checkOnly ? "true" : "false",
    });
}

/**
 * Initiates or checks a payment for a Submission.
 * @param {number} verifiableDocId - The verifiable doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {string} constraintName - The payment constraint name.
 * @param {number} level - The submission level.
 * @param {boolean} checkOnly - Whether to only check status/expiration.
 * @returns {Promise<string>} The encoded payment info.
 */
export async function payToSubmission_C(
    verifiableDocId: number,
    submittableSlug: string,
    constraintName: string,
    level: number,
    checkOnly: boolean
) {
    return await APIFetch_C<string>(`/payment/submission`, "POST", {
        verifiable_doc_id: verifiableDocId.toString(),
        submittable_slug: submittableSlug,
        constraint_name: constraintName,
        level: level.toString(),
        check_only: checkOnly ? "true" : "false",
    });
}
