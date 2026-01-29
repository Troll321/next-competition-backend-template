import { auth0 } from "@/api/authentication/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
    return await auth0.middleware(request);
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico, sitemap.xml, robots.txt (metadata files)
         * - api and admin
         */
        "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api|admin).*)",
    ],
};
