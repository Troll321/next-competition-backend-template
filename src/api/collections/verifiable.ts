import {
    ValidationError,
    type ArrayFieldValidation,
    type CollectionConfig,
    type Field,
    APIError,
    TextFieldValidation,
} from "payload";
import { getDrizzle_S } from "../utils/getDrizzle";
import { incrementVersionNumber, sCacheVerifiable_S } from "../utils/redisCaching";

const drizzle = getDrizzle_S();
const preloadedField = [
    "id",
    "verified",
    "creator",
    "shared",
    "message_subject",
    "message_body",
    "_msyssec",
    "_msysrevsec",
    "total_count",
];

function escapeTableName(tableName: string) {
    return tableName.replaceAll(".", "_");
}

const uniqueObjName: ArrayFieldValidation = function (arr, ctx) {
    if (arr === null || arr === undefined) {
        return true;
    }
    const isExist: { [key: string]: boolean } = {};
    if (!ctx.siblingData || !((ctx.siblingData as any).constraints instanceof Array)) {
        return true;
    }
    if (!(ctx.siblingData as any).required_on_create) {
        (ctx.siblingData as any).required_on_create = [];
    }
    //@ts-expect-error This is based on the config
    const allName = [...ctx.siblingData.constraints, ...ctx.siblingData.required_on_create];
    for (let i = 0; i < allName.length; i++) {
        if (isExist[allName[i].name]) {
            return "Name must be unique!";
        }
        isExist[allName[i].name] = true;
    }
    return true;
};

const safeName: TextFieldValidation = function (str) {
    if (typeof str === "string" && !/^[a-z0-9_]+$/.test(str)) {
        return "Name should only consists of lowercase Alpha Numeric and underscore";
    }
    if (typeof str === "string" && preloadedField.includes(str)) {
        return "Name already reserved by system";
    }
    return true;
};

const safeCode: TextFieldValidation = function (str) {
    if (!str) {
        return "Can't be undefined";
    }
    return /^[A-Z0-9][A-Z0-9]$/.test(str) ? true : "Code should be 2 capital alphanumeric";
};

const obj: Field[] = [
    {
        name: "name",
        type: "text",
        required: true,
        validate: safeName,
    },
    {
        name: "type",
        type: "select",
        options: ["text", "file", "payment", "boolean", "number"],
        required: true,
        admin: {
            description: "Don't set this to file or payment on required_on_create",
        },
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
        name: "unique",
        type: "checkbox",
        defaultValue: false,
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
];

async function createTable(
    tableName: string,
    constraints: any,
    required_on_create: any,
    singleton: boolean,
    db: any
) {
    tableName = `external_self_managed.${tableName}`;

    const cols: string[] = [];
    const uniques: string[] = [];
    if (!required_on_create) {
        required_on_create = [];
    }
    const allArr = [...required_on_create, ...constraints];
    let idx = 0;
    for (const col of allArr) {
        const colName = col.name;
        let type = "";
        switch (col.type) {
            case "boolean":
                type = "BOOLEAN";
                break;
            case "number":
                type = "INTEGER";
            default:
                type = "TEXT";
                break;
        }

        cols.push(`${colName} ${type}${idx < required_on_create.length ? " NOT NULL" : ""}`);
        const uniqueIndexName = `\"${escapeTableName(tableName)}_${colName}_unique_idx\"`;
        if (col.unique) {
            uniques.push(`CONSTRAINT ${uniqueIndexName} UNIQUE (${colName})`);
        }
        idx++;
    }

    if (singleton) {
        const uniqueIndexName = `\"${escapeTableName(tableName)}_creator_unique_idx\"`;
        uniques.push(`CONSTRAINT ${uniqueIndexName} UNIQUE (creator)`);
    }

    let sqlQ = `CREATE SCHEMA IF NOT EXISTS external_self_managed`;
    await db.execute(sqlQ);

    sqlQ = `CREATE TABLE ${tableName} (id SERIAL PRIMARY KEY, verified INTEGER NOT NULL DEFAULT 0, creator TEXT NOT NULL, shared TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], message_subject TEXT NOT NULL DEFAULT '', message_body TEXT NOT NULL DEFAULT '', ${cols.join(", ")}${uniques.length !== 0 ? `, ${uniques.join(", ")}` : ""})`;
    await db.execute(sqlQ);

    const sharedIndexName = `\"${escapeTableName(tableName)}_shared_gin_idx\"`;
    sqlQ = `CREATE INDEX ${sharedIndexName} ON ${tableName} USING GIN (shared)`;
    await db.execute(sqlQ);

    const creatorIndexName = `\"${escapeTableName(tableName)}_creator_btree_idx\"`;
    sqlQ = `CREATE INDEX ${creatorIndexName} ON ${tableName} (creator)`;
    await db.execute(sqlQ);
}

async function deleteTable(tableName: string, db: any) {
    tableName = `external_self_managed.${tableName}`;
    const sqlQ = `DROP TABLE IF EXISTS ${tableName}`;
    await db.execute(sqlQ);
}

async function updateCol(
    tableName: string,
    oldName: string,
    oldUnique: boolean,
    newName: string,
    newUnique: boolean,
    db: any
) {
    tableName = `external_self_managed.${tableName}`;

    let sqlQ;

    if (oldUnique) {
        const oldIndexName = `\"${escapeTableName(tableName)}_${oldName}_unique_idx\"`;
        sqlQ = `ALTER TABLE ${tableName} DROP CONSTRAINT ${oldIndexName}`;
        await db.execute(sqlQ);
    }

    if (oldName !== newName) {
        sqlQ = `ALTER TABLE ${tableName} RENAME COLUMN ${oldName} TO ${newName}`;
        await db.execute(sqlQ);
    }

    if (newUnique) {
        const newIndexName = `\"${escapeTableName(tableName)}_${newName}_unique_idx\"`;
        sqlQ = `CREATE UNIQUE INDEX ${newIndexName} ON ${tableName} (${newName})`;
        await db.execute(sqlQ);
    }
}

async function createCol(
    tableName: string,
    name: string,
    type: string,
    unique: boolean,
    isRoc: boolean, // is required_on_create
    db: any
) {
    tableName = `external_self_managed.${tableName}`;

    let sqlQ;
    switch (type) {
        case "boolean":
            type = "BOOLEAN";
            break;
        case "number":
            type = "INTEGER";
        default:
            type = "TEXT";
            break;
    }

    sqlQ = `ALTER TABLE ${tableName} ADD COLUMN ${name} ${type} ${isRoc ? "NOT NULL" : ""}`;
    await db.execute(sqlQ);

    if (unique) {
        const indexName = `\"${escapeTableName(tableName)}_${name}_unique_idx\"`;
        sqlQ = `CREATE UNIQUE INDEX ${indexName} ON ${tableName} (${name})`;
        await db.execute(sqlQ);
    }
}

async function deleteCol(tableName: string, name: string, unique: boolean, db: any) {
    tableName = `external_self_managed.${tableName}`;

    let sqlQ;
    if (unique) {
        const indexName = `\"${escapeTableName(tableName)}_${name}_unique_idx\"`;
        sqlQ = `ALTER TABLE ${tableName} DROP CONSTRAINT ${indexName}`;
        await db.execute(sqlQ);
    }
    sqlQ = `ALTER TABLE ${tableName} DROP COLUMN ${name}`;
    await db.execute(sqlQ);
}

export const Verifiable: CollectionConfig = {
    slug: "verifiable",
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
            access: {
                update: () => {
                    return false;
                },
            },
            validate: safeName,
        },
        {
            name: "verifiable_code",
            type: "text",
            required: true,
            unique: true,
            maxLength: 2,
            minLength: 2,
            validate: safeCode,
        },
        {
            name: "singleton",
            type: "checkbox",
            defaultValue: true,
        },
        { name: "min_shared", type: "number", defaultValue: 0, min: 0, required: true },
        { name: "max_shared", type: "number", defaultValue: 0, min: 0, required: true },
        { name: "depends_on", type: "text" },
        {
            name: "depended_by",
            type: "array",
            defaultValue: [],
            fields: [{ name: "slug", type: "text", required: true }],
            admin: {
                readOnly: true,
            },
        },
        {
            name: "constraints",
            type: "array",
            required: true,
            fields: obj,
            validate: uniqueObjName,
        },
        {
            name: "required_on_create",
            type: "array",
            fields: obj,
            validate: uniqueObjName,
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
            async ({ operation, data, previousDoc, req }) => {
                await sCacheVerifiable_S(data ? (data as any) : null, previousDoc.slug);
                await incrementVersionNumber("verifiable", previousDoc.slug, data === undefined);

                if (data === undefined) {
                    return;
                }

                if (data.depends_on === data.slug) {
                    throw new ValidationError({
                        errors: [
                            {
                                message: "Can't depend on self",
                                path: "depends_on",
                            },
                        ],
                    });
                }

                if (previousDoc.depends_on !== data.depends_on) {
                    if (data.depends_on) {
                        // Add to new
                        // Only be 1 because unique slug property
                        const doc = (
                            await req.payload.find({
                                collection: "verifiable",
                                where: { slug: { equals: data.depends_on } },
                            })
                        ).docs[0];
                        if (!doc) {
                            throw new ValidationError({
                                errors: [
                                    {
                                        message: "depends_on is not a valid slug",
                                        path: "depends_on",
                                    },
                                ],
                            });
                        }

                        await req.payload.update({
                            collection: "verifiable",
                            id: doc.id,
                            data: {
                                depended_by: [...doc.depended_by!, { slug: data.slug }],
                            },
                        });
                    }
                    if (previousDoc.depends_on) {
                        // Remove from old
                        // Only be 1 because unique slug property
                        const doc = (
                            await req.payload.find({
                                collection: "verifiable",
                                where: { slug: { equals: previousDoc.depends_on } },
                            })
                        ).docs[0];

                        await req.payload.update({
                            collection: "verifiable",
                            id: doc.id,
                            data: {
                                depended_by: doc.depended_by!.filter((obj) => {
                                    return obj.slug !== previousDoc.slug;
                                }),
                            },
                        });
                    }
                }

                let error: null | ValidationError = null;
                try {
                    await drizzle.transaction(async (tx) => {
                        try {
                            const db = tx;

                            if (operation === "create") {
                                try {
                                    await createTable(
                                        data.slug,
                                        data.constraints,
                                        data.required_on_create,
                                        data.singleton,
                                        db
                                    );
                                    return true;
                                } catch (err) {
                                    error = new ValidationError({
                                        errors: [
                                            {
                                                message: "This slug already exists or reserved",
                                                path: "slug",
                                            },
                                        ],
                                    });
                                    throw err;
                                }
                            }

                            // Identify Difference
                            const map: Record<
                                string,
                                { name: string; type: string; unique: boolean; visited?: boolean }
                            > = {};
                            const oriNames: Record<string, boolean> = {};
                            const allData = [...data.required_on_create, ...data.constraints];
                            const allOri = [
                                ...previousDoc.required_on_create,
                                ...previousDoc.constraints,
                            ];
                            const allOperations = [];

                            for (let i = 0; i < allOri.length; i++) {
                                const now = allOri[i];
                                map[now.id] = {
                                    name: now.name,
                                    type: now.type,
                                    unique: now.unique,
                                };
                                oriNames[now.name] = true;
                            }

                            if (previousDoc.singleton !== data.singleton) {
                                allOperations.push(
                                    updateCol(
                                        data.slug,
                                        "creator",
                                        previousDoc.singleton,
                                        "creator",
                                        data.singleton,
                                        db
                                    )
                                );
                            }

                            for (let i = 0; i < allData.length; i++) {
                                const now = allData[i];
                                if (map[now.id] === undefined) {
                                    allOperations.push(
                                        createCol(
                                            data.slug,
                                            now.name,
                                            now.type,
                                            now.unique,
                                            i < data.required_on_create.length,
                                            db
                                        )
                                    );
                                } else {
                                    if (map[now.id].type !== now.type) {
                                        error = new ValidationError({
                                            errors: [
                                                {
                                                    message:
                                                        "Cannot change type! (alternative delete and then create)",
                                                    path: "constraints",
                                                },
                                                {
                                                    message:
                                                        "Cannot change type! (alternative delete and then create)",
                                                    path: "required_on_create",
                                                },
                                            ],
                                        });
                                        throw error;
                                    }

                                    if (
                                        map[now.id].name !== now.name ||
                                        map[now.id].unique !== now.unique
                                    ) {
                                        if (map[now.id].name !== now.name && oriNames[now.name]) {
                                            error = new ValidationError({
                                                errors: [
                                                    {
                                                        message:
                                                            "Changed name already exist on old db (update array item 1 by 1, save each changes)",
                                                        path: "constraints",
                                                    },
                                                    {
                                                        message:
                                                            "Changed name already exist on old db (update array item 1 by 1, save each changes)",
                                                        path: "required_on_create",
                                                    },
                                                ],
                                            });
                                            throw error;
                                        }
                                        allOperations.push(
                                            updateCol(
                                                data.slug,
                                                map[now.id].name,
                                                map[now.id].unique,
                                                now.name,
                                                now.unique,
                                                db
                                            )
                                        );
                                    }

                                    map[now.id].visited = true;
                                }
                            }
                            for (let i = 0; i < allOri.length; i++) {
                                const now = allOri[i];
                                if (map[now.id].visited !== true) {
                                    allOperations.push(
                                        deleteCol(
                                            data.slug,
                                            map[now.id].name,
                                            map[now.id].unique,
                                            db
                                        )
                                    );
                                }
                            }

                            // Execute Difference
                            await Promise.all(allOperations);
                            return true;
                        } catch (err) {
                            if (process.env.NODE_ENV !== "production") {
                                console.log(err);
                            }
                            await tx.rollback();
                        }
                    });
                } catch {
                    if (error !== null) {
                        throw error;
                    }
                    throw new APIError("Problem in Hooks", 500);
                }
            },
        ],
        beforeDelete: [
            async ({ id, req }) => {
                try {
                    await drizzle.transaction(async (tx) => {
                        try {
                            const db = tx;

                            const doc = await req.payload.findByID({
                                collection: "verifiable",
                                id: id,
                                depth: 0,
                            });

                            await deleteTable(doc.slug, db);
                            return true;
                        } catch (err) {
                            if (process.env.NODE_ENV !== "production") {
                                console.log(err);
                            }
                            await tx.rollback();
                        }
                    });
                } catch {
                    throw new APIError("Problem in Hooks", 500);
                }
            },
        ],
    },
};
