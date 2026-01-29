import "server-only";
import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import { NextRequest, NextResponse } from "next/server";
import { paymentWebhookHandler_S } from "@root/src/api/payment/server";

export async function GET(req: NextRequest) {
    const key = await req.nextUrl.searchParams.get("key");
    return NextResponse.json("Halo: " + key);
}

export async function POST(req: NextRequest) {
    try {
        const key = await req.nextUrl.searchParams.get("key");

        if (typeof key !== "string") {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const reqBody = await req.json();
        if (typeof reqBody !== "object") {
            throw new HttpError(HttpErrorEnum.InvalidRequestBody);
        }

        await paymentWebhookHandler_S(key, reqBody);
        return NextResponse.json(true, { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
