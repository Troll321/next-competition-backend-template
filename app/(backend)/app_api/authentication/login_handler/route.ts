import { getUser_S } from "@/api/authentication/server";
import { createDoc_S, readDoc_S } from "@/api/form/server";
import { httpErrorHandler_S } from "@root/src/api/errorHandler/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    try {
        let redirectUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}${await req.nextUrl.searchParams.get("redirect")}`;

        const user = await getUser_S();
        if (user && user.email_verified) {
            if ((await readDoc_S("profile", {}, undefined, user)).length === 0) {
                await createDoc_S("profile", {}, user);
                redirectUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/dashboard/profile`;
            }
        }

        const url = new URL(redirectUrl);
        return NextResponse.redirect(url);
    } catch (_err) {
        return httpErrorHandler_S(_err);
    }
}
