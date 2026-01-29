import { sendEmailVerif_S } from "@/api/authentication/server";
import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    try {
        const captchaToken = (await req.nextUrl.searchParams).get("captcha_token");
        if (!captchaToken) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }
        await sendEmailVerif_S(captchaToken);
        return NextResponse.json(true, { status: 200 });
    } catch (_err) {
        return httpErrorHandler_S(_err);
    }
}
