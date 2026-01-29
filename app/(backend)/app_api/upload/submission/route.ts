import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import {
    AdminFileInfoOption,
    getSubmissionFileInfo_S,
    uploadFileToSubmission_S,
} from "@/api/upload/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const searchParams = await req.nextUrl.searchParams;
        const verifiable_doc_id = searchParams.get("verifiable_doc_id");
        const submittable_slug = searchParams.get("submittable_slug");
        const constraint_name = searchParams.get("constraint_name");

        if (!verifiable_doc_id || !submittable_slug || !constraint_name) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const iVerifiableDocId = parseInt(verifiable_doc_id);
        if (isNaN(iVerifiableDocId)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestBody);
        }

        return NextResponse.json(
            await uploadFileToSubmission_S(
                iVerifiableDocId,
                submittable_slug,
                constraint_name,
                file
            ),
            { status: 200 }
        );
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}

export async function GET(req: NextRequest) {
    try {
        const searchParams = await req.nextUrl.searchParams;
        const verifiable_doc_id = searchParams.get("verifiable_doc_id");
        const submittable_slug = searchParams.get("submittable_slug");
        const constraint_name = searchParams.get("constraint_name");
        const level = searchParams.get("level");
        const _adminOption = searchParams.get("admin_option");

        if (!verifiable_doc_id || !submittable_slug || !constraint_name || !level) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const iVerifiableDocId = parseInt(verifiable_doc_id);
        if (isNaN(iVerifiableDocId)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }
        const iLevel = parseInt(level);
        if (isNaN(iLevel)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        let adminOption: AdminFileInfoOption | undefined = undefined;
        if (typeof _adminOption === "string") {
            try {
                adminOption = JSON.parse(_adminOption);
            } catch {
                adminOption = undefined;
            }
        }
        if (
            adminOption &&
            (typeof adminOption !== "object" || typeof adminOption.allowRead !== "boolean")
        ) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        return NextResponse.json(
            await getSubmissionFileInfo_S(
                iVerifiableDocId,
                submittable_slug,
                constraint_name,
                iLevel,
                adminOption
            ),
            { status: 200 }
        );
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
