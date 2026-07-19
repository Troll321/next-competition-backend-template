import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import { isAccessorVerified_S } from "@/api/form/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params;
        const accessor = await req.nextUrl.searchParams.get("accessor");
        if (!accessor) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }
        return NextResponse.json(await isAccessorVerified_S(slug, accessor), { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
