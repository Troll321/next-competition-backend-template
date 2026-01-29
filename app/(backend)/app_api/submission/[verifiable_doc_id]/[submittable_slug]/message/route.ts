import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import { sendMessageToSubmission_S } from "@/api/submission/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
    req: NextRequest,
    { params }: { params: { verifiable_doc_id: string; submittable_slug: string } }
) {
    try {
        const { verifiable_doc_id, submittable_slug } = await params;
        let iVerifiableDocId = parseInt(verifiable_doc_id);
        if (isNaN(iVerifiableDocId)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const json = await req.json();
        if (
            typeof json !== "object" ||
            typeof json.sendEmail !== "boolean" ||
            typeof json.message_subject !== "string" ||
            typeof json.message_body !== "string"
        ) {
            throw new HttpError(HttpErrorEnum.InvalidRequestBody);
        }

        await sendMessageToSubmission_S(
            iVerifiableDocId,
            submittable_slug,
            json.message_subject,
            json.message_body,
            json.sendEmail
        );
        return NextResponse.json(true, { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
