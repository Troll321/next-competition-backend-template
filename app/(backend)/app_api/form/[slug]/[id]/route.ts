import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import { requestVerify_S, shareDoc_S } from "@/api/form/server";
import { isArrayOfString_SC } from "@/api/utils/validation";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
    try {
        const { slug, id } = await params;
        const iId = parseInt(id);
        if (Number.isNaN(iId)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }
        await requestVerify_S(slug, iId);
        return NextResponse.json(true, { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
    try {
        const { slug, id } = await params;
        const iId = parseInt(id);
        if (Number.isNaN(iId)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const json = await req.json();
        const share = json?.share;
        if (!isArrayOfString_SC(share)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestBody);
        }
        const unshare = json?.unshare;
        if (!isArrayOfString_SC(unshare)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestBody);
        }

        await shareDoc_S(slug, iId, share as string[], unshare as string[]);
        return NextResponse.json(true, { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
