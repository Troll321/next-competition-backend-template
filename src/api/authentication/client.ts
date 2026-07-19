"use client";
import "client-only";
import { APIFetch_C } from "../utils/fetching";
// useUser_C is now context-backed: reads from UserProvider instead of
// creating a new subscription per component. Import path stays the same.
export { useUser_C } from "@/components/providers/UserProvider";

/**
 * Sends a request to the server to trigger a verification email.
 * @param {string} captchaToken - The reCAPTCHA token.
 * @returns {Promise<void>}
 */
export async function sendEmailVerif_C(captchaToken: string) {
    await APIFetch_C<void>(
        "/authentication/verify_email?" + new URLSearchParams({ captcha_token: captchaToken }),
        "GET"
    );
}
