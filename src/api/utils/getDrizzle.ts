// import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

let cachedDrizzle: ReturnType<typeof drizzle>;

export function getDrizzle_S() {
    if (cachedDrizzle) {
        return cachedDrizzle;
    }

    cachedDrizzle = drizzle({ client: postgres(process.env.POSTGRES_URL!, { prepare: false }) });
    return cachedDrizzle;
}
