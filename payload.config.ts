import { buildConfig } from "payload";
// import { postgresAdapter } from "@payloadcms/db-postgres";
import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { Verifiable } from "@/api/collections/verifiable";
import { Submittable } from "@/api/collections/submittable";

export const runtime = "nodejs";

export default buildConfig({
    secret: process.env.PAYLOAD_SECRET!,
    cookiePrefix: "mypayloadcookies",
    db: mongooseAdapter({
        // pool: {
        //     connectionString: process.env.DATABASE_URL!,
        //     max: 2,
        // },
        url: process.env.MONGODB_URL!,
    }),
    collections: [Verifiable, Submittable],
    admin: {
        components: {
            afterNavLinks: ["@/admin/MySideNavigation.tsx"],
            views: {
                verifiableView: {
                    Component: "@/admin/VerifiableView.tsx",
                    path: "/verifiable_view",
                },
                submissionView: {
                    Component: "@/admin/SubmissionView.tsx",
                    path: "/submission_view",
                },
            },
        },
    },
});
