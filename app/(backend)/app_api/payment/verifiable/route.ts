import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import { payToVerifiable_S } from "@root/src/api/payment/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const searchParams = await req.nextUrl.searchParams;
        const slug = searchParams.get("slug");
        const doc_id = searchParams.get("doc_id");
        const constraint_name = searchParams.get("constraint_name");
        const check_only = searchParams.get("check_only");

        if (!slug || !doc_id || !constraint_name || !check_only) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const iVerifiableDocId = parseInt(doc_id);
        if (isNaN(iVerifiableDocId)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        return NextResponse.json(
            await payToVerifiable_S(
                slug,
                iVerifiableDocId,
                constraint_name,
                check_only === "true" ? true : false
            ),
            {
                status: 200,
            }
        );
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
