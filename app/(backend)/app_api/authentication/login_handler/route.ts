import { loginHandler_S } from "@root/src/api/authentication/loginHandler";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const redirect = `${process.env.NEXT_PUBLIC_APP_BASE_URL}${(await req.nextUrl.searchParams).get("redirect") ?? "/"}`;

    await loginHandler_S();

    const url = new URL(redirect);
    return NextResponse.redirect(url);
}
