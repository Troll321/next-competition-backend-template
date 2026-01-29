import { Auth } from "./auth";
import { Form } from "./form";
import { Submission } from "./submission";

export default async function Page() {
    return (
        <div className="bg-[#0a0a0a] text-white" >
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
