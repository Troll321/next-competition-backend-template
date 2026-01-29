"use client";

import { readDoc_C } from "@root/src/api/form/client";
import { payToVerifiable_C } from "@root/src/api/payment/client";

export default function Page() {
    return (
        <section>
            <h1>See Console!</h1>
            <button
                onClick={async () => {
                    await payToVerifiable_C(
                        "tim_paper",
                        (await readDoc_C("tim_paper", {}))[0].id,
                        "bayar",
                        false
                    );
                }}>
                Pay
            </button>
        </section>
    );
}
