import "server-only";
import { HttpError, HttpErrorEnum } from "@/api/errorHandler/class";
import { httpErrorHandler_S } from "@/api/errorHandler/server";
import {
    AdminFormDeleteOption,
    AdminFormReadOption,
    createDoc_S,
    deleteDoc_S,
    readDoc_S,
    UnsanitizedFormInsert,
    UnsanitizedFormWhere,
    updateDoc_S,
} from "@/api/form/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params;
        const searchParams = await req.nextUrl.searchParams;

        const _where = searchParams.get("where");
        const _adminOption = searchParams.get("admin_option");

        let where = {};

        if (typeof _where === "string") {
            try {
                where = JSON.parse(_where);
            } catch {
                where = {};
            }
        }

        let adminOption: AdminFormReadOption | undefined = undefined;

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
                (adminOption.orderBy && typeof adminOption.orderBy.field !== "string") ||
                (adminOption.orderBy && typeof adminOption.orderBy.isAsc !== "boolean") ||
                (adminOption.shouldPopulate && typeof adminOption.shouldPopulate !== "boolean"))
        ) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }
        return NextResponse.json(await readDoc_S(slug, where, adminOption), { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params;

        const insert = (await req.json())?.insert;
        if (typeof insert !== "object") {
            throw new HttpError(HttpErrorEnum.InvalidRequestBody);
        }

        await createDoc_S(slug, insert as UnsanitizedFormInsert);
        return NextResponse.json(true, { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params;
        const _where = await req.nextUrl.searchParams.get("where");
        let where = {};

        if (typeof _where === "string") {
            try {
                where = JSON.parse(_where);
                if (typeof where !== "object") {
                    where = {};
                }
            } catch {
                where = {};
            }
        }

        const insert = (await req.json())?.insert;
        if (typeof insert !== "object") {
            throw new HttpError(HttpErrorEnum.InvalidRequestBody);
        }

        await updateDoc_S(slug, insert as UnsanitizedFormInsert, where as UnsanitizedFormWhere);
        return NextResponse.json(true, { status: 200 });
    } catch (_err: any) {
        console.log(_err);
        return httpErrorHandler_S(_err);
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params;
        const searchParams = await req.nextUrl.searchParams;
        const _where = searchParams.get("where");
        const _adminOption = searchParams.get("admin_option");

        let where = {};

        if (typeof _where === "string") {
            try {
                where = JSON.parse(_where);
                if (typeof where !== "object") {
                    where = {};
                }
            } catch {
                where = {};
            }
        }

        let adminOption: AdminFormDeleteOption | undefined = undefined;

        if (typeof _adminOption === "string") {
            try {
                adminOption = JSON.parse(_adminOption);
            } catch {
                adminOption = undefined;
            }
        }

        if (
            adminOption &&
            (typeof adminOption !== "object" || typeof adminOption.cascadeDelete !== "boolean")
        ) {
            throw new HttpError(HttpErrorEnum.InvalidRequestParam);
        }

        await deleteDoc_S(slug, where as UnsanitizedFormWhere, adminOption);
        return NextResponse.json(true, { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
