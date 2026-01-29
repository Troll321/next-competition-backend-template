import { httpErrorHandler_S } from "@/api/errorHandler/server";
import { getSubmittable_S } from "@/api/submission/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { submittable_slug: string } }) {
    try {
        const { submittable_slug } = await params;

        return NextResponse.json(await getSubmittable_S(submittable_slug), { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
