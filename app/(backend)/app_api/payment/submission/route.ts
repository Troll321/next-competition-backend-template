import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import { payToSubmission_S } from "@/api/payment/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const searchParams = await req.nextUrl.searchParams;
        const verifiable_doc_id = searchParams.get("verifiable_doc_id");
        const submittable_slug = searchParams.get("submittable_slug");
        const constraint_name = searchParams.get("constraint_name");
        const level = searchParams.get("level");
        const check_only = searchParams.get("check_only");

        if (!verifiable_doc_id || !submittable_slug || !constraint_name || !level || !check_only) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const iVerifiableDocId = parseInt(verifiable_doc_id);
        if (isNaN(iVerifiableDocId)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }
        const iLevel = parseInt(verifiable_doc_id);
        if (isNaN(iLevel)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        return NextResponse.json(
            await payToSubmission_S(
                iVerifiableDocId,
                submittable_slug,
                constraint_name,
                iLevel,
                check_only === "true" ? true : false
            ),
            { status: 200 }
        );
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
