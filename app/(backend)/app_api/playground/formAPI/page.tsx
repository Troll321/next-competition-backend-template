// import { getVerifiable_S, readDoc_S } from "@/api/form/server";
import Client from "./client";

export default async function Page() {
    // console.log(await getVerifiable_S("profile"));
    // console.log(await readDoc_S("profile", {}));
    return (
        <section>
            <h1>See Console!</h1>
            <Client></Client>
            {/* <VerifiableForm slug="profile" /> */}
        </section>
    );
}
