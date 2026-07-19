"use client";

import VerifiableForm from "@/components/functional/VerifiableForm";

export function Form() {
    return (
        <div className="flex flex-row items-center justify-center gap-5">
            <div>
                <h1>Profile Form</h1>
                <VerifiableForm slug="profile" />
            </div>
            <div className="h-[250px] w-2 bg-white"></div>
            <div>
                <h1>Tim Paper Form</h1>
                <VerifiableForm slug="tim_poster" />
            </div>
        </div>
    );
}
