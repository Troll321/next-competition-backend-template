import "server-only";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import { NextRequest, NextResponse } from "next/server";
import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { joinWithVerifiableCode_S } from "@/api/form/server";

export async function POST(req: NextRequest) {
    try {
        const fullVerifiableCode = (await req.json())?.fullVerifiableCode;
        if (typeof fullVerifiableCode !== "string") {
            throw new HttpError(HttpErrorEnum.InvalidRequestBody);
        }

        await joinWithVerifiableCode_S(fullVerifiableCode);
        return NextResponse.json(true, { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
