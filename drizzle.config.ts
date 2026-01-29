import { defineConfig } from "drizzle-kit";
export default defineConfig({
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.POSTGRES_URL!,
    },
});
