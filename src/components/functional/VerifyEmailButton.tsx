"use client";

import { getLoginURL_SC } from "@/api/authentication/both";
import { sendEmailVerif_C, useUser_C } from "@/api/authentication/client";
import { BASE_API_URL } from "@/api/constants";
import Link from "next/link";
import { useState } from "react";
//@ts-ignore I think this library is JS based
import ReCAPTCHA from "react-google-recaptcha";

export default function VerifyEmailButton() {
    const { user, isLoading } = useUser_C();
    const [captchaToken, setCaptchaToken] = useState<null | string>(null);

    if (isLoading || !user || user.email_verified) {
        return <></>;
    }

    return (
        <div>
            <button
                disabled={captchaToken ? false : true}
                onClick={async () => {
                    if (captchaToken) {
                        const _cToken = captchaToken;
                        setCaptchaToken(null);
                        await sendEmailVerif_C(_cToken);
                    }
                }}>
                Resend Verification Email, refresh to re-recaptcha
            </button>
            <ReCAPTCHA
                sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
                onChange={(token: string) => {
                    setCaptchaToken(token);
                }}
            />
            <p>After clicking the email link please press this button to refresh verified status</p>
            <Link href={getLoginURL_SC(BASE_API_URL + "/playground/authenticationAPI")}>
                Refresh status
            </Link>
        </div>
    );
}
