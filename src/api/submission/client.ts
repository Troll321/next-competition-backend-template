"use client";
import "client-only";
import {
    AdminSubmission,
    AdminSubmissionDeleteOption,
    AdminSubmissionReadOption,
    Submission,
    UnsanitizedSubmissionInsert,
} from "./server";
import { APIFetch_C } from "../utils/fetching";
import { Submittable } from "../../../payload-types";
import { submittableLCache } from "../utils/localCaching";

/**
 * Fetches the Submittable configuration for a given slug.
 * Uses local caching to reduce API calls.
 * @param {string} submittableSlug - The slug of the submittable.
 * @returns {Promise<Submittable>} The Submittable object.
 */
export async function getSubmittable_C(submittableSlug: string) {
    submittableSlug = encodeURIComponent(submittableSlug);
    const cached = await submittableLCache.get(submittableSlug);
    if (cached) {
        return cached;
    }
    const out = await APIFetch_C<Submittable>(`/submittable/${submittableSlug}`, "GET");
    await submittableLCache.cache(submittableSlug, out);
    return out;
}

export async function getSubmission_C(
    verifiableDocId: number,
    submittableSlug: string,
    adminOption: AdminSubmissionReadOption
): Promise<AdminSubmission>;

export async function getSubmission_C(
    verifiableDocId: number,
    submittableSlug: string,
    adminOption?: undefined
): Promise<Submission | null>;

/**
 * Fetches a Submission or a list of Submissions (Admin only).
 * @param {number} verifiableDocId - The ID of the verifiable document.
 * @param {string} submittableSlug - The submittable slug.
 * @param {AdminSubmissionReadOption} [adminOption] - Admin filtering options.
 * @returns {Promise<AdminSubmission | Submission | null>} The submission(s).
 */
export async function getSubmission_C(
    verifiableDocId: number,
    submittableSlug: string,
    adminOption?: AdminSubmissionReadOption
) {
    const safeVerifiableDocId = encodeURIComponent(verifiableDocId);
    submittableSlug = encodeURIComponent(submittableSlug);

    const queryObj: Record<string, string> = {};

    if (adminOption) {
        queryObj.admin_option = JSON.stringify(adminOption);
    }

    return await APIFetch_C<AdminSubmission | Submission | null>(
        `/submission/${safeVerifiableDocId}/${submittableSlug}`,
        "GET",
        queryObj
    );
}

/**
 * Updates a submission with new data.
 * @param {number} verifiableDocId - The doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {UnsanitizedSubmissionInsert} rawInsert - The data to update.
 * @returns {Promise<Submission | null>} The updated submission.
 */
export async function updateSubmission_C(
    verifiableDocId: number,
    submittableSlug: string,
    rawInsert: UnsanitizedSubmissionInsert
) {
    const safeVerifiableDocId = encodeURIComponent(verifiableDocId);
    submittableSlug = encodeURIComponent(submittableSlug);

    return await APIFetch_C<Submission | null>(
        `/submission/${safeVerifiableDocId}/${submittableSlug}`,
        "POST",
        {},
        { insert: rawInsert }
    );
}

/**
 * Locks a submission, preventing further edits until reviewed.
 * @param {number} verifiableDocId - The doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @returns {Promise<Submission | null>} The locked submission.
 */
export async function lockSubmission_C(verifiableDocId: number, submittableSlug: string) {
    const safeVerifiableDocId = encodeURIComponent(verifiableDocId);
    submittableSlug = encodeURIComponent(submittableSlug);

    return await APIFetch_C<Submission | null>(
        `/submission/${safeVerifiableDocId}/${submittableSlug}`,
        "PUT"
    );
}

/**
 * Reviews a submission (Admin only).
 * @param {number} verifiableDocId - The doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {boolean} verdict - True to approve (advance level), False to reject.
 * @param {string} messageSubject - Feedback subject.
 * @param {string} messageBody - Feedback body.
 * @returns {Promise<void>}
 */
export async function reviewSubmission_C(
    verifiableDocId: number,
    submittableSlug: string,
    verdict: boolean,
    messageSubject: string,
    messageBody: string
) {
    const safeVerifiableDocId = encodeURIComponent(verifiableDocId);
    submittableSlug = encodeURIComponent(submittableSlug);

    return await APIFetch_C<void>(
        `/submission/${safeVerifiableDocId}/${submittableSlug}/review`,
        "POST",
        undefined,
        {
            verdict,
            message_subject: messageSubject,
            message_body: messageBody,
        }
    );
}

/**
 * Deletes a submission (Admin only).
 * @param {number} verifiableDocId - The doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {AdminSubmissionDeleteOption} adminOption - Deletion options (force delete).
 * @returns {Promise<void>}
 */
export async function deleteSubmission_C(
    verifiableDocId: number,
    submittableSlug: string,
    adminOption: AdminSubmissionDeleteOption
) {
    const safeVerifiableDocId = encodeURIComponent(verifiableDocId);
    submittableSlug = encodeURIComponent(submittableSlug);

    return await APIFetch_C<void>(
        `/submission/${safeVerifiableDocId}/${submittableSlug}`,
        "DELETE",
        { admin_option: JSON.stringify(adminOption) }
    );
}

/**
 * Sends a message/feedback to a submission owner (Admin only).
 * @param {number} verifiableDocId - The doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {string} messageSubject - The message subject.
 * @param {string} messageBody - The message body.
 * @param {boolean} sendEmail - Whether to dispatch an email.
 * @returns {Promise<void>}
 */
export async function sendMessageToSubmission_C(
    verifiableDocId: number,
    submittableSlug: string,
    messageSubject: string,
    messageBody: string,
    sendEmail: boolean
) {
    const safeVerifiableDocId = encodeURIComponent(verifiableDocId);
    submittableSlug = encodeURIComponent(submittableSlug);

    return await APIFetch_C<void>(
        `/submission/${safeVerifiableDocId}/${submittableSlug}/message`,
        "POST",
        undefined,
        {
            message_subject: messageSubject,
            message_body: messageBody,
            sendEmail,
        }
    );
}
