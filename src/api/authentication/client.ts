"use client";
import "client-only";
import { useUser } from "@auth0/nextjs-auth0";
import { APIFetch_C } from "../utils/fetching";

// This is only a remap to help the FE team know this function exists
/**
 * Hook to retrieve the current user and their loading state.
 */
export const useUser_C = useUser;

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
