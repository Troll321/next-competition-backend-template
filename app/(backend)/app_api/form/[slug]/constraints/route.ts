import { httpErrorHandler_S } from "@/api/errorHandler/server";
import { getVerifiable_S } from "@/api/form/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params;

        return NextResponse.json(await getVerifiable_S(slug), { status: 200 });
    } catch (_err: any) {
        return httpErrorHandler_S(_err);
    }
}
