import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import { sendMessageToVerifiable_S } from "@/api/form/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
    try {
        const { slug, id } = await params;
        const iId = parseInt(id);
        if (Number.isNaN(iId)) {
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

        await sendMessageToVerifiable_S(
            slug,
            iId,
            json.message_subject,
            json.message_body,
            json.sendEmail
        );
        return NextResponse.json(true, { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
