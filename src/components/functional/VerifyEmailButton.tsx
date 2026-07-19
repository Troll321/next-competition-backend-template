"use client";

import { sendEmailVerif_C, useUser_C } from "@/api/authentication/client";
import { useEffect, useState } from "react";
//@ts-expect-error I think this library is JS based
import ReCAPTCHA from "react-google-recaptcha";

export default function VerifyEmailButton() {
    const { user, isLoading, triggerRefresh } = useUser_C();
    const [captchaToken, setCaptchaToken] = useState<null | string>(null);
    const [emailSent, setEmailSent] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(false);

    // Poll more aggressively after sending verification email
    useEffect(() => {
        if (!emailSent || !user) return;

        setCheckingStatus(true);
        // Poll every 5 seconds for 2 minutes after sending email
        let pollCount = 0;
        const maxPolls = 24; // 24 * 5s = 2 minutes

        const interval = setInterval(() => {
            pollCount++;
            triggerRefresh();

            if (pollCount >= maxPolls || user.email_verified) {
                clearInterval(interval);
                setCheckingStatus(false);
                setEmailSent(false);
            }
        }, 5000); // Every 5 seconds

        return () => {
            clearInterval(interval);
            setCheckingStatus(false);
        };
    }, [emailSent, triggerRefresh, user, user?.email_verified]);

    if (isLoading || !user || user.email_verified) {
        return <></>;
    }

    return (
        <div className="flex flex-col gap-4">
            <button
                disabled={captchaToken ? false : true}
                onClick={async () => {
                    if (captchaToken) {
                        const _cToken = captchaToken;
                        setCaptchaToken(null);
                        await sendEmailVerif_C(_cToken);
                        setEmailSent(true);
                    }
                }}
                className="w-fit text-black transition-colors hover:text-gray-700 disabled:opacity-50">
                Resend Verification Email, refresh to re-recaptcha
            </button>
            <div className="w-fit overflow-hidden rounded-md border border-gray-200">
                <ReCAPTCHA
                    sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
                    onChange={(token: string) => {
                        setCaptchaToken(token);
                    }}
                />
            </div>
            {checkingStatus && (
                <p className="animate-pulse text-sm text-blue-600">
                    ✓ Email sent! Automatically checking verification status...
                </p>
            )}
            {!checkingStatus && (
                <p className="text-sm text-gray-600">
                    After clicking the verification link in your email, this page will automatically
                    update.
                </p>
            )}
        </div>
    );
}
