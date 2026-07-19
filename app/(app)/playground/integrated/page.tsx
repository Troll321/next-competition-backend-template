import { Auth } from "./auth";
import { Form } from "./form";
import { Submission } from "./submission";

export default async function Page() {
    return (
        <div>
            <Auth />
            <hr />
            <br />
            <Form />
            <br />
            <hr />
            <br />
            <Submission />
        </div>
    );
}
