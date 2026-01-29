import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import {
    AdminSubmissionDeleteOption,
    AdminSubmissionReadOption,
    deleteSubmission_S,
    getSubmission_S,
    lockSubmission_S,
    UnsanitizedSubmissionInsert,
    updateSubmission_S,
} from "@/api/submission/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
    req: NextRequest,
    { params }: { params: { verifiable_doc_id: string; submittable_slug: string } }
) {
    try {
        const { verifiable_doc_id, submittable_slug } = await params;
        let iVerifiableDocId = parseInt(verifiable_doc_id);
        if (isNaN(iVerifiableDocId)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const searchParams = await req.nextUrl.searchParams;
        const _adminOption = searchParams.get("admin_option");

        let adminOption: AdminSubmissionReadOption | undefined = undefined;

        if (typeof _adminOption === "string") {
            try {
                adminOption = JSON.parse(_adminOption);
            } catch {
                adminOption = undefined;
            }
        }

        if (
            adminOption &&
            (typeof adminOption !== "object" ||
                typeof adminOption.page !== "number" ||
                typeof adminOption.where !== "object" ||
                (adminOption.orderBy && typeof adminOption.orderBy.field !== "string") ||
                (adminOption.orderBy && typeof adminOption.orderBy.isAsc !== "boolean"))
        ) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        return NextResponse.json(
            adminOption
                ? await getSubmission_S(iVerifiableDocId, submittable_slug, adminOption)
                : await getSubmission_S(iVerifiableDocId, submittable_slug),
            {
                status: 200,
            }
        );
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: { verifiable_doc_id: string; submittable_slug: string } }
) {
    try {
        const { verifiable_doc_id, submittable_slug } = await params;
        let iVerifiableDocId = parseInt(verifiable_doc_id);
        if (isNaN(iVerifiableDocId)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        await lockSubmission_S(iVerifiableDocId, submittable_slug);
        return NextResponse.json(true, { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}

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

        const insert = (await req.json())?.insert;
        if (typeof insert !== "object") {
            throw new HttpError(HttpErrorEnum.InvalidRequestBody);
        }

        await updateSubmission_S(
            iVerifiableDocId,
            submittable_slug,
            insert as UnsanitizedSubmissionInsert
        );
        return NextResponse.json(true, { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: { verifiable_doc_id: string; submittable_slug: string } }
) {
    try {
        const { verifiable_doc_id, submittable_slug } = await params;
        let iVerifiableDocId = parseInt(verifiable_doc_id);
        if (isNaN(iVerifiableDocId)) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        const searchParams = await req.nextUrl.searchParams;
        const _adminOption = searchParams.get("admin_option");

        let adminOption: AdminSubmissionDeleteOption = { forceDelete: false };

        if (typeof _adminOption === "string") {
            try {
                adminOption = JSON.parse(_adminOption);
            } catch {
                adminOption = { forceDelete: false };
            }
        }

        if (
            adminOption &&
            (typeof adminOption !== "object" || typeof adminOption.forceDelete !== "boolean")
        ) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        await deleteSubmission_S(iVerifiableDocId, submittable_slug, adminOption);
        return NextResponse.json(true, {
            status: 200,
        });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
