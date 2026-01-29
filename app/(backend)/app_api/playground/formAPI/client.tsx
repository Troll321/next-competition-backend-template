"use client";

import {
    deleteDoc_C,
    getVerifiable_C,
    readDoc_C,
    requestVerify_C,
    shareDoc_C,
    updateDoc_C,
} from "@/api/form/client";

async function CRUDTest() {
    const constraint = await getVerifiable_C("profile");
    let flag = 0;
    constraint.constraints.filter((val) => {
        flag += (val.name === "nama" || val.name === "institusi") as any as number;
        return true;
    });

    console.log(constraint);
    if (flag !== 2) {
        throw "Please add nama and institusi to profile!";
    }

    console.log(await readDoc_C("profile", { nama: "gulgul" }));
    console.log(await readDoc_C("profile", {}));
    console.log(await updateDoc_C("profile", { nama: "Gulgul" }, {}));
    console.log(await deleteDoc_C("profile", { nama: "Gulgul" }));
}

async function verifyTest() {
    // await createDoc_C("profile", { name: "Gulgul" });
    const dId = (await readDoc_C("profile", {}))[0].id;
    try {
        await requestVerify_C("profile", dId);
    } catch (err) {
        console.log("EXPECTED!!!!\n------------\n", err);
    }
    await updateDoc_C("profile", { nama: "Atila", institusi: "UGM" }, {});
    await requestVerify_C("profile", dId);
    try {
        await deleteDoc_C("profile", {});
    } catch (err) {
        console.log("EXPECTED!!!!\n------------\n", err);
    }
}

async function sharedTest() {
    const dId = (await readDoc_C("profile", {}))[0].id;
    await shareDoc_C("profile", dId, ["atila.ghulwani@gmail.com"], []);
}

async function handleClick() {
    console.log("TESTING CLIENT!!!");
    await CRUDTest();
    await verifyTest();
    await sharedTest();
    console.log("SUCCESFULL NO ERROR!!!");
}

export default function Client() {
    return (
        <>
            <h1>Client Components Loaded!</h1>
            <button
                onClick={() => {
                    handleClick();
                }}>
                Trigger Client
            </button>
        </>
    );
}
