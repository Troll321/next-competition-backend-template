import { createDoc_S, readDoc_S } from "../form/server";
import { getUser_S } from "./server";

/**
 * This executes everytime the user logins
 * On this example this will create a new "profile" verifiable if non existent 
 */
export async function loginHandler_S() {
    const user = await getUser_S();
    if (user && user.email_verified) {
        if ((await readDoc_S("profile", {}, undefined, user)).length === 0) {
            await createDoc_S("profile", {}, user);
        }
    }
}