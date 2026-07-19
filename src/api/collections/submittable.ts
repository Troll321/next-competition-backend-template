import { ArrayFieldValidation, CollectionConfig } from "payload";
import { incrementVersionNumber, sCacheSubmittable_S } from "../utils/redisCaching";

const preloadedField = ["signed_urls", "versions"];

function _safeName(str: any) {
    if (typeof str === "string" && !/^[a-z0-9_]+$/.test(str)) {
        return "Name should only consists of lowercase Alpha Numeric and underscore";
    }
    if (typeof str === "string" && preloadedField.includes(str)) {
        return "Name already reserved by system";
    }
    return true;
}

const uniqueName: ArrayFieldValidation = function (arr, ctx) {
    if (arr) {
        const used: Record<string, boolean> = {};
        for (let i = 0; i < arr.length; i++) {
            if (used[(arr[i] as any).name]) {
                return "Name must be unique in each level";
            }
            used[(arr[i] as any).name] = true;
        }
    }
    return true;
};

export const Submittable: CollectionConfig = {
    slug: "submittable",
    access: {
        read: () => {
            return true;
        },
    },
    fields: [
        {
            name: "slug",
            type: "text",
            required: true,
            unique: true,
            validate: (str: any) => {
                return _safeName(str);
            },
        },
        {
            name: "verifiable",
            type: "text",
            required: true,
            hasMany: false,
            validate: async (value, { req }) => {
                if (
                    value &&
                    (
                        await req.payload.find({
                            collection: "verifiable",
                            where: {
                                slug: {
                                    equals: value,
                                },
                            },
                        })
                    ).docs.length === 0
                ) {
                    return "Verifiable doesn't exists";
                }
                return true;
            },
        },
        {
            name: "levels",
            required: true,
            type: "array",
            admin: {
                isSortable: false,
            },
            fields: [
                { name: "ui_title", type: "text", defaultValue: "" },
                { name: "ui_description", type: "text", defaultValue: "" },
                {
                    name: "start_date",
                    type: "date",
                    required: true,
                    admin: {
                        date: {
                            pickerAppearance: "dayAndTime",
                        },
                    },
                    validate: (date, { siblingData }) => {
                        if (!date) {
                            return true;
                        }

                        if (
                            ((siblingData as any).end_date as Date) &&
                            date > ((siblingData as any).end_date as Date)
                        ) {
                            return "Start Date should before End Date";
                        }
                        return true;
                    },
                },
                {
                    name: "end_date",
                    type: "date",
                    required: true,
                    admin: {
                        date: {
                            pickerAppearance: "dayAndTime",
                        },
                    },
                    validate: (date, { siblingData }) => {
                        if (!date) {
                            return true;
                        }

                        if (
                            ((siblingData as any).start_date as Date) &&
                            ((siblingData as any).start_date as Date) > date
                        ) {
                            return "Start Date should before End Date";
                        }
                        return true;
                    },
                },
                {
                    name: "constraints",
                    type: "array",
                    required: true,
                    validate: uniqueName,
                    fields: [
                        {
                            name: "name",
                            type: "text",
                            required: true,
                            validate: (str: any) => {
                                return _safeName(str);
                            },
                        },
                        {
                            name: "type",
                            type: "select",
                            options: ["text", "file", "payment", "boolean", "number"],
                            required: true,
                        },
                        {
                            name: "pay_amount",
                            type: "number",
                            required: true,
                            defaultValue: 20000,
                            min: 20000,
                            admin: { description: "This only affects payment type field" },
                        },
                        {
                            name: "max_input_size_kb",
                            type: "number",
                            required: true,
                            defaultValue: 1000,
                            admin: {
                                description: "This also true for text type!",
                            },
                        },
                        {
                            name: "mime_type",
                            type: "text",
                            hasMany: true,
                            required: true,
                            defaultValue: ["text/plain"],
                        },
                        {
                            name: "ui_title",
                            type: "text",
                            defaultValue: "",
                        },
                        {
                            name: "ui_description",
                            type: "textarea",
                            defaultValue: "",
                        },
                    ],
                },
            ],
        },
    ],
    admin: {
        useAsTitle: "slug",
        description:
            "Warning: Wrong operation could delete production data, please know what you are doing!",
        group: "Dangerous",
    },
    hooks: {
        afterChange: [
            async ({ data, previousDoc }) => {
                await sCacheSubmittable_S(data ? (data as any) : null, previousDoc.slug);
                await incrementVersionNumber("submittable", previousDoc.slug, data === undefined);
            },
        ],
    },
};
