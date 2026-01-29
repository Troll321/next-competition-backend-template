import "server-only";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";
import {
    ExpectedAuthError,
    ExpectedAuthErrorEnum,
    HttpError,
    HttpErrorEnum,
} from "../errorHandler/class";
import { User } from "@auth0/nextjs-auth0/types";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

export const auth0 = new Auth0Client({
    domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    secret: process.env.AUTH0_SECRET,
    appBaseUrl: process.env.NEXT_PUBLIC_APP_BASE_URL,
    onCallback: async function (error, context) {
        if (error) {
            return NextResponse.redirect(
                new URL(`/?error=${error.message}`, process.env.NEXT_PUBLIC_APP_BASE_URL)
            );
        }

        return NextResponse.redirect(
            new URL(context.returnTo || "/", process.env.NEXT_PUBLIC_APP_BASE_URL)
        );
    },
});

/**
 * Retrieves the currently authenticated user's session from Auth0.
 * @returns {Promise<User | null>} The user object if authenticated, otherwise null.
 */
export async function getUser_S() {
    return (await auth0.getSession())?.user ?? null;
}

async function getAccessToken_S() {
    const cred = {
        client_id: process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_CLIENT_SECRET,
        audience: `${process.env.AUTH0_BASE_URL}/api/v2/`,
        grant_type: "client_credentials",
    };
    const baseURL = `${process.env.AUTH0_BASE_URL}/oauth/token`;
    const res = await fetch(baseURL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(cred),
    });
    return (await res.json()).access_token;
}

async function verifyCaptcha(token: string): Promise<boolean> {
    const res = await fetch(
        "https://www.google.com/recaptcha/api/siteverify?" +
            new URLSearchParams({
                response: token,
                secret: process.env.RECAPTCHA_SECRET_KEY!,
            }),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        }
    );
    if (!res.ok) {
        throw new HttpError(HttpErrorEnum.ServerError);
    }

    return (await res.json()).success as boolean;
}

/**
 * Sends a verification email to the currently authenticated user.
 * @param {string} captchaToken - The reCAPTCHA token to verify the request.
 * @throws {ExpectedAuthError} If user is unauthenticated (Unauthenticated) or captcha fails (InvalidToken).
 * @throws {HttpError} If the Auth0 API request fails.
 */
export async function sendEmailVerif_S(captchaToken: string) {
    const user = await getUser_S();
    if (!user) {
        throw new ExpectedAuthError(ExpectedAuthErrorEnum.Unauthenticated);
    }
    if (user.email_verified) {
        return;
    }
    // Verify Captcha Token
    if (!(await verifyCaptcha(captchaToken))) {
        throw new ExpectedAuthError(ExpectedAuthErrorEnum.InvalidToken);
    }
    const baseURL = `${process.env.AUTH0_BASE_URL}/api/v2/jobs/verification-email`;
    const accessToken = await getAccessToken_S();
    const res = await fetch(baseURL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({ user_id: user.sub }),
    });
    if (!res.ok) {
        throw new ExpectedAuthError(ExpectedAuthErrorEnum.ThirdPartyError);
    }
    await res.json();
}

/**
 * Validates and returns the user object.
 * This function enforces authentication and email verification unless flagged as a server-side internal call.
 * @param {User} [_user] - Optional user object to use instead of fetching from session.
 * @param {boolean} [_isFromServer] - If true, bypasses checks and returns null (simulating a system/admin context where no user is needed directly, or checks are skipped).
 * @returns {Promise<User | null>} The validated user object.
 * @throws {ExpectedAuthError} If unauthenticated or email not verified.
 */
export async function getValidUser_S(_user?: User, _isFromServer?: boolean): Promise<User | null> {
    if (_isFromServer) {
        return null;
    }
    let user: User | null = null;
    if (_user) {
        user = _user;
    } else {
        user = await getUser_S();
        if (!user) {
            throw new ExpectedAuthError(ExpectedAuthErrorEnum.Unauthenticated);
        }
        if (!user.email_verified) {
            throw new ExpectedAuthError(ExpectedAuthErrorEnum.EmailNotVerified);
        }
    }
    return user;
}

/**
 * Checks if the current user is an Admin by verifying the payload cookie.
 * @returns {Promise<boolean>} True if valid admin cookie exists, false otherwise.
 */
export async function isAdmin_S() {
    const cookie = (await cookies()).get("mypayloadcookies-token");
    if (!cookie) {
        return false;
    }

    try {
        const textAsBuffer = new TextEncoder().encode(process.env.PAYLOAD_SECRET!);
        const hashBuffer = await crypto.subtle.digest("SHA-256", textAsBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray
            .map((item) => item.toString(16).padStart(2, "0"))
            .join("")
            .slice(0, 32);

        return await new Promise((resolve) => {
            jwt.verify(cookie.value, hash, (err) => {
                if (err) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    } catch {
        return false;
    }
}