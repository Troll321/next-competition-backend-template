import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import {
    AdminFileInfoOption,
    getVerifiableFileInfo_S,
    uploadFileToVerifiable_S,
} from "@/api/upload/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const searchParams = await req.nextUrl.searchParams;
        const slug = searchParams.get("slug");
        const doc_id = searchParams.get("doc_id");
        const constraint_name = searchParams.get("constraint_name");

        if (!slug || !doc_id || !constraint_name) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const iVerifiableDocId = parseInt(doc_id);
        if (isNaN(iVerifiableDocId)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestBody);
        }

        return NextResponse.json(
            await uploadFileToVerifiable_S(slug, iVerifiableDocId, constraint_name, file),
            { status: 200 }
        );
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}

export async function GET(req: NextRequest) {
    try {
        const searchParams = await req.nextUrl.searchParams;
        const slug = searchParams.get("slug");
        const doc_id = searchParams.get("doc_id");
        const constraint_name = searchParams.get("constraint_name");
        const _adminOption = searchParams.get("admin_option");

        if (!slug || !doc_id || !constraint_name) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const iVerifiableDocId = parseInt(doc_id);
        if (isNaN(iVerifiableDocId)) {
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
            await getVerifiableFileInfo_S(slug, iVerifiableDocId, constraint_name, adminOption),
            { status: 200 }
        );
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
