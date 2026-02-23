import "server-only";
import {
    ExpectedAuthError,
    ExpectedAuthErrorEnum,
    FormError,
    FormErrorEnum,
} from "../errorHandler/class";
import { Verifiable } from "../../../payload-types";
import { User } from "@auth0/nextjs-auth0/types";
import { isArrayOfString_SC } from "../utils/validation";
import { getValidUser_S, isAdmin_S } from "../authentication/server";
import {
    AdminSQLRow,
    genAccesor_S,
    genSql_S,
    genUW_S,
    iCustomGenSQL,
    r_S,
    ReccurSQLRow,
    SQLRow,
} from "../utils/sql";
import { getPayloadClient_S } from "../utils/getPayload";
import { getDrizzle_S } from "../utils/getDrizzle";
import { deleteFile_S } from "../upload/server";
import { fromBase36_SC, permuteNumber_SC, toBase36_SC, unpermuteNumber_SC } from "../utils/string";
import { sendEmail_S } from "../utils/email";

const payload: Awaited<ReturnType<typeof getPayloadClient_S>> = await getPayloadClient_S();
const drizzle = getDrizzle_S();

const preloadedField = [
    { name: "creator", type: "text" },
    { name: "shared", type: "text[]" },
    { name: "id", type: "number" },
    { name: "verified", type: "number" },
    { name: "message_subject", type: "text" },
    { name: "message_body", type: "text" },
] as const;

type SliceFrom<
    T extends readonly unknown[],
    N extends number,
    Acc extends readonly unknown[] = [],
> = Acc["length"] extends N
    ? T
    : T extends readonly [infer _, ...infer Rest]
      ? SliceFrom<Rest, N, [...Acc, 0]>
      : [];

type PreloadedWhere = SliceFrom<typeof preloadedField, 2>[number]["name"];
type FormInsert = Record<string, string | number | boolean>;
type FormWhere = Record<string, string | number | boolean> &
    Partial<Record<PreloadedWhere, string | number | boolean>>;
export type UnsanitizedFormInsert = Record<any, any>;
export type UnsanitizedFormWhere = Partial<Record<PreloadedWhere, any>> & Record<any, any>;

export interface AdminFormReadOption {
    page: number;
    orderBy?: {
        field: string;
        isAsc: boolean;
    };
    shouldPopulate?: boolean;
}

export interface AdminFormDeleteOption {
    cascadeDelete: boolean;
}

// Chitoge birth date and Nisekoi S1 release year
const MAGIC_NUMBER = 6072014;
function encodeFullVerifiableCode(verifiableCode: string, docId: number) {
    return `${verifiableCode}.${toBase36_SC(permuteNumber_SC(docId + permuteNumber_SC(fromBase36_SC(verifiableCode) + MAGIC_NUMBER))).padStart(4, "0")}`;
}

function decodeFullVerifiableCode(docCode: string) {
    if (docCode.length !== 7) {
        throw new FormError(FormErrorEnum.InvalidCode);
    }
    const arr = docCode.split(".");
    if (arr.length !== 2 || arr[0].length !== 2 || arr[1].length !== 4) {
        throw new FormError(FormErrorEnum.InvalidCode);
    }

    return {
        verifiableCode: arr[0],
        docId:
            unpermuteNumber_SC(fromBase36_SC(arr[1])) -
            permuteNumber_SC(fromBase36_SC(arr[0]) + MAGIC_NUMBER),
    };
}

function validateType(type: string, toCompare: any) {
    if (type === "boolean" && typeof toCompare === "boolean") {
        return toCompare;
    } else if (type === "number" && typeof toCompare === "number" && Number.isInteger(toCompare)) {
        return toCompare;
    } else if (toCompare instanceof String || typeof toCompare === "string") {
        return toCompare.toString();
    } else if (type === "text[]" && isArrayOfString_SC(toCompare)) {
        return `{${(toCompare as string[]).join(", ")}}`;
    } else {
        throw new FormError(FormErrorEnum.ValueDifferentFromType);
    }
}

function sanitizeWhere(
    where: UnsanitizedFormWhere,
    constraints: Verifiable["constraints"],
    required_on_create: Verifiable["required_on_create"],
    _isFromServer: boolean = false
): FormWhere {
    if (!where || typeof where !== "object") {
        throw new FormError(FormErrorEnum.InvalidInput, "where");
    }
    const objOut: FormWhere = {};
    if (!required_on_create) {
        required_on_create = [];
    }
    const allArr = [...constraints, ...required_on_create, ...preloadedField.slice(2)];

    if (_isFromServer) {
        allArr.push(preloadedField[0], preloadedField[1]);
    }

    for (let i = 0; i < allArr.length; i++) {
        const { name, type } = allArr[i];
        if (where[name] !== undefined && where[name] !== null) {
            objOut[name] = validateType(type, where[name]);
        }
    }

    return objOut;
}

function sanitizeInsert(
    insert: UnsanitizedFormInsert,
    constraints: Verifiable["constraints"],
    required_on_create: Verifiable["required_on_create"],
    isCreate: boolean = false,
    _isFromServer: boolean = false
): FormInsert {
    if (!insert || typeof insert !== "object") {
        throw new FormError(FormErrorEnum.InvalidInput, "insert");
    }
    const objOut: FormInsert = {};
    if (!required_on_create) {
        required_on_create = [];
    }
    const allArr: { name: string; type: string; max_input_size_kb?: number }[] = [
        ...required_on_create,
        ...constraints,
    ];

    if (_isFromServer) {
        allArr.push(...preloadedField);
    }

    for (let i = 0; i < allArr.length; i++) {
        const { name, type, max_input_size_kb } = allArr[i];

        if (insert[name] !== undefined && insert[name] !== null) {
            if (!_isFromServer && (type === "file" || type === "payment")) {
                continue;
            }
            objOut[name] = validateType(type, insert[name]);
            if (
                max_input_size_kb !== undefined &&
                type === "text" &&
                new Blob([objOut[name] as string]).size > max_input_size_kb * 1024
            ) {
                throw new FormError(FormErrorEnum.InvalidInput, "insert");
            }
        } else if (isCreate) {
            if (i < required_on_create.length) {
                throw new FormError(FormErrorEnum.NecessaryFieldNotSupplied);
            }
        }
    }

    return objOut;
}
/**
 * Retrieves the Verifiable configuration from Payload CMS.
 * @param {string} slug - The verifiable slug.
 * @returns {Promise<Verifiable>} The verifiable configuration document.
 * @throws {FormError} If slug is invalid (InvalidSlug).
 */
export async function getVerifiable_S(slug: string) {
    const res = await payload.find({
        collection: "verifiable",
        depth: 0,
        pagination: false,
        where: {
            slug: {
                equals: slug,
            },
        },
    });

    if (res.docs.length === 0) {
        throw new FormError(FormErrorEnum.InvalidSlug);
    }

    return res.docs[0];
}

async function mapToAdminSqlRow(
    queryRes: (SQLRow & {
        total_count: number;
        _msyssec: string;
        _msysrevsec: string;
    })[],
    verifiable_code: string,
    adminOption: AdminFormReadOption,
    depends_on: Verifiable["depends_on"],
    depended_by: Verifiable["depended_by"]
): Promise<AdminSQLRow[]> {
    const outRes: AdminSQLRow[] = [];
    for (let i = 0; i < queryRes.length; i++) {
        const sqlRow = queryRes[i];
        const outObj: AdminSQLRow = {
            ...sqlRow,
            verifiableCode: encodeFullVerifiableCode(verifiable_code, sqlRow.id as number),
            dependsOnArr: [],
            dependedByArr: [],
        };

        // @ts-ignore total_count is string (sql stuff)
        outObj.total_count = parseInt(outObj.total_count);
        if (!adminOption.shouldPopulate) {
            outRes.push(outObj);
            continue;
        }
        const accessorEmails = [sqlRow.creator, ...sqlRow.shared];

        if (depends_on) {
            outObj.dependsOnArr.push(
                ...(
                    await readDoc_S(depends_on, {}, undefined, undefined, true, accessorEmails)
                ).map((obj) => ({ ...obj, slug: depends_on }))
            );
        }

        // depended_by has a default value [] property thus not null
        const set = new Set<ReccurSQLRow>();
        for (let j = 0; j < depended_by!.length; j++) {
            (
                await readDoc_S(
                    depended_by![j].slug,
                    {},
                    undefined,
                    undefined,
                    true,
                    accessorEmails
                )
            ).forEach((nowDoc) => {
                set.add({ ...nowDoc, slug: depended_by![j].slug });
            });
        }

        set.forEach((val) => {
            outObj.dependedByArr.push(val);
        });

        outRes.push(outObj);
    }

    return outRes;
}

export async function readDoc_S(
    slug: string,
    rawWhere: UnsanitizedFormWhere,
    adminOption?: undefined,
    _user?: User,
    _isFromServer?: boolean,
    _accessor?: string[],
    _rdc?: {
        count?: boolean;
        verAb?: number;
        verBel?: number;
        project?: string[];
    }
): Promise<SQLRow[]>;

export async function readDoc_S(
    slug: string,
    rawWhere: UnsanitizedFormWhere,
    adminOption?: AdminFormReadOption,
    _user?: User,
    _isFromServer?: boolean,
    _accessor?: string[],
    _rdc?: {
        count?: boolean;
        verAb?: number;
        verBel?: number;
        project?: string[];
    }
): Promise<AdminSQLRow[]>;

export async function readDoc_S(
    slug: string,
    rawWhere: UnsanitizedFormWhere,
    adminOption?: AdminFormReadOption,
    _user?: User,
    _isFromServer: boolean = false,
    _accessor?: string[],
    _rdc?: {
        count?: boolean;
        verAb?: number;
        verBel?: number;
        project?: string[];
    }
): Promise<SQLRow[] | AdminSQLRow[]> {
    if (adminOption && !_isFromServer) {
        // Check if admin
        if (!(await isAdmin_S())) {
            throw new ExpectedAuthError(ExpectedAuthErrorEnum.NotAdmin);
        }

        _isFromServer = true;
    }

    const user = await getValidUser_S(_user, _isFromServer);

    const { constraints, required_on_create, verifiable_code, depends_on, depended_by } =
        await getVerifiable_S(slug);
    const where = sanitizeWhere(rawWhere, constraints, required_on_create, _isFromServer);

    let whereQ = null;
    if (Object.keys(where).length > 0) {
        whereQ = genUW_S(where, [" = ", " AND "]);
    }

    if (adminOption) {
        const ADMIN_PAGING_LIMIT = parseInt(process.env.NEXT_PUBLIC_ADMIN_PAGING_LIMIT!);
        if (!adminOption.orderBy) {
            adminOption.orderBy = {
                field: "id",
                isAsc: true,
            };
        } else {
            // Cek apakah orderBy valid
            const allArr: { name: string }[] = [...constraints];
            if (required_on_create) {
                allArr.push(...required_on_create);
            }
            allArr.push(...preloadedField);

            let valid = false;
            for (let i = 0; i < allArr.length; i++) {
                if (allArr[i].name === adminOption.orderBy.field) {
                    valid = true;
                    break;
                }
            }

            if (!valid) {
                adminOption.orderBy.field = "id";
            }
        }
        adminOption.page = Math.max(1, adminOption.page);
        let queryRes: any;
        if (adminOption.orderBy.field === "id") {
            if (!whereQ) {
                //@ts-ignore This is expected from the possible field values defined in Payload
                queryRes = await drizzle.execute(
                    genSql_S`WITH cols AS (SELECT *, ROW_NUMBER() OVER(ORDER BY id ${r_S(adminOption.orderBy.isAsc ? "ASC" : "DESC")}) AS _msyssec, ROW_NUMBER() OVER(ORDER BY id ${r_S(!adminOption.orderBy.isAsc ? "ASC" : "DESC")}) AS _msysrevsec FROM ${r_S(`external_self_managed.${slug}`)}) SELECT *, cols._msyssec + cols._msysrevsec - 1 AS total_count FROM cols WHERE cols._msyssec BETWEEN ${(adminOption.page - 1) * ADMIN_PAGING_LIMIT + 1} AND ${adminOption.page * ADMIN_PAGING_LIMIT} ORDER BY cols._msyssec`
                );
            } else {
                //@ts-ignore This is expected from the possible field values defined in Payload
                queryRes = await drizzle.execute(
                    genSql_S`WITH cols AS (SELECT *, ROW_NUMBER() OVER(ORDER BY id ${r_S(adminOption.orderBy.isAsc ? "ASC" : "DESC")}) AS _msyssec, ROW_NUMBER() OVER(ORDER BY id ${r_S(!adminOption.orderBy.isAsc ? "ASC" : "DESC")}) AS _msysrevsec FROM ${r_S(`external_self_managed.${slug}`)} WHERE ${whereQ}) SELECT *, cols._msyssec + cols._msysrevsec - 1 AS total_count FROM cols WHERE cols._msyssec BETWEEN ${(adminOption.page - 1) * ADMIN_PAGING_LIMIT + 1} AND ${adminOption.page * ADMIN_PAGING_LIMIT} ORDER BY cols._msyssec`
                );
            }
        } else {
            if (!whereQ) {
                //@ts-ignore This is expected from the possible field values defined in Payload
                queryRes = await drizzle.execute(
                    genSql_S`WITH cols AS (SELECT *, ROW_NUMBER() OVER(ORDER BY id ${r_S(adminOption.orderBy.isAsc ? "ASC" : "DESC")}) AS _msyssec, ROW_NUMBER() OVER(ORDER BY id ${r_S(!adminOption.orderBy.isAsc ? "ASC" : "DESC")}) AS _msysrevsec FROM ${r_S(`external_self_managed.${slug}`)}) SELECT *, cols._msyssec + cols._msysrevsec - 1 AS total_count FROM cols ORDER BY ${r_S(adminOption.orderBy.field)} LIMIT ${ADMIN_PAGING_LIMIT} OFFSET ${(adminOption.page - 1) * ADMIN_PAGING_LIMIT}`
                );
            } else {
                //@ts-ignore This is expected from the possible field values defined in Payload
                queryRes = await drizzle.execute(
                    genSql_S`WITH cols AS (SELECT *, ROW_NUMBER() OVER(ORDER BY id ${r_S(adminOption.orderBy.isAsc ? "ASC" : "DESC")}) AS _msyssec, ROW_NUMBER() OVER(ORDER BY id ${r_S(!adminOption.orderBy.isAsc ? "ASC" : "DESC")}) AS _msysrevsec FROM ${r_S(`external_self_managed.${slug}`)} WHERE ${whereQ}) SELECT *, cols._msyssec + cols._msysrevsec - 1 AS total_count FROM cols ORDER BY ${r_S(adminOption.orderBy.field)} LIMIT ${ADMIN_PAGING_LIMIT} OFFSET ${(adminOption.page - 1) * ADMIN_PAGING_LIMIT}`
                );
            }
        }

        return await mapToAdminSqlRow(
            queryRes,
            verifiable_code,
            adminOption,
            depends_on,
            depended_by
        );
    } else {
        let queryRes: SQLRow[];
        if (_isFromServer && !_accessor) {
            if (!whereQ) {
                //@ts-ignore This is expected from the possible field values defined in Payload
                queryRes = await drizzle.execute(
                    genSql_S`SELECT ${r_S(_rdc?.count ? "COUNT(*) as length" : _rdc?.project && _rdc.project.length > 0 ? _rdc.project.join(", ") : "*")} FROM ${r_S(`external_self_managed.${slug}`)}${r_S(_rdc?.verAb ? ` WHERE verified > ${_rdc.verAb}` : _rdc?.verBel ? ` WHERE verified < ${_rdc.verBel}` : "")}`
                );
            } else {
                //@ts-ignore This is expected from the possible field values defined in Payload
                queryRes = await drizzle.execute(
                    genSql_S`SELECT ${r_S(_rdc?.count ? "COUNT(*) as length" : _rdc?.project && _rdc.project.length > 0 ? _rdc.project.join(", ") : "*")} FROM ${r_S(`external_self_managed.${slug}`)} WHERE ${whereQ}${r_S(_rdc?.verAb ? ` AND verified > ${_rdc.verAb}` : _rdc?.verBel ? ` AND verified < ${_rdc.verBel}` : "")}`
                );
            }
        } else {
            // There are only 2 option thus, this is safe
            const toQuery = _accessor && _isFromServer ? _accessor : [user!.email!];
            if (!whereQ) {
                //@ts-ignore This is expected from the possible field values defined in Payload
                queryRes = await drizzle.execute(
                    genSql_S`SELECT ${r_S(_rdc?.count ? "COUNT(*) as length" : _rdc?.project && _rdc.project.length > 0 ? _rdc.project.join(", ") : "*")} FROM ${r_S(`external_self_managed.${slug}`)} WHERE ${genAccesor_S(toQuery)}${r_S(_rdc?.verAb ? ` AND verified > ${_rdc.verAb}` : _rdc?.verBel ? ` AND verified < ${_rdc.verBel}` : "")}`
                );
            } else {
                //@ts-ignore This is expected from the possible field values defined in Payload
                queryRes = await drizzle.execute(
                    genSql_S`SELECT ${r_S(_rdc?.count ? "COUNT(*) as length" : _rdc?.project && _rdc.project.length > 0 ? _rdc.project.join(", ") : "*")} FROM ${r_S(`external_self_managed.${slug}`)} WHERE ${genAccesor_S(toQuery)} AND ${whereQ}${r_S(_rdc?.verAb ? ` AND verified > ${_rdc.verAb}` : _rdc?.verBel ? ` AND verified < ${_rdc.verBel}` : "")}`
                );
            }
        }

        return queryRes.map((sqlRow) => {
            const outObj = {
                ...sqlRow,
                verifiableCode: encodeFullVerifiableCode(verifiable_code, sqlRow.id as number),
            };

            if ((outObj as any).length) {
                (outObj as any).length = parseInt((outObj as any).length);
            }
            return outObj;
        });
    }
}

/**
 * Creates a new Verifiable document.
 * @param {string} slug - The verifiable slug.
 * @param {UnsanitizedFormInsert} rawInsert - The data to insert.
 * @param {User} [_user] - (Internal Backend Only) Optional user object to use instead of fetching from session. Use carefully.
 * @param {boolean} [_isFromServer=false] - (Internal Backend Only) Bypass checks. Use carefully.
 * @returns {Promise<void>}
 * @throws {FormError} If duplicate (singleton), invalid input, or missing required fields.
 */
export async function createDoc_S(
    slug: string,
    rawInsert: UnsanitizedFormInsert,
    _user?: User,
    _isFromServer: boolean = false
) {
    const user = await getValidUser_S(_user, _isFromServer);

    const { required_on_create, constraints, singleton } = await getVerifiable_S(slug);
    const insert = sanitizeInsert(rawInsert, constraints, required_on_create, true, _isFromServer);

    if (
        singleton &&
        (
            await /** rdcCountOpt */ readDoc_S(
                slug,
                {},
                undefined,
                undefined,
                undefined,
                undefined,
                { count: true }
            )
        )[0].length !== 0
    ) {
        throw new FormError(FormErrorEnum.DuplicateDocuments);
    }

    // Will never be 0 because we have preloaded field
    const cols = [];
    const values: (string | number | boolean)[] = [];

    if (!_isFromServer) {
        cols.push("creator");
        values.push(user!.email!);
    }

    for (const key in insert) {
        cols.push(key);
        values.push(insert[key]);
    }

    if (cols.length === 0) {
        throw new FormError(FormErrorEnum.InvalidInput, "insert");
    }

    try {
        await drizzle.execute(
            genSql_S`INSERT INTO ${r_S(`external_self_managed.${slug}`)} (${r_S([cols, ","])}) VALUES (${[values, ","]})`
        );
    } catch (err: any) {
        if (err?.cause?.routine === "_bt_check_unique") {
            throw new FormError(FormErrorEnum.DuplicateDocuments);
        }
        throw err;
    }
}

/**
 * Updates a Verifiable document.
 * @param {string} slug - The verifiable slug.
 * @param {UnsanitizedFormInsert} rawInsert - The data to update.
 * @param {UnsanitizedFormWhere} rawWhere - The targeting condition.
 * @param {User} [_user] - (Internal Backend Only) Optional user object to use instead of fetching from session. Use carefully.
 * @param {boolean} [_isFromServer=false] - (Internal Backend Only) Bypass checks. Use carefully.
 * @param {boolean} [_ignoreVerifiedChecking=false] - (Internal Backend Only) Allow updating verified docs (internal/admin). Use carefully.
 * @param {string[]} [_accessor] - (Internal Backend Only) Specific emails to check access for. Use carefully.
 * @returns {Promise<void>}
 * @throws {FormError} If update not allowed (e.g. verified), duplicates, or invalid input.
 */
export async function updateDoc_S(
    slug: string,
    rawInsert: UnsanitizedFormInsert,
    rawWhere: UnsanitizedFormWhere,
    _user?: User,
    _isFromServer: boolean = false,
    _ignoreVerifiedChecking: boolean = false,
    _accessor?: string[]
) {
    const user = await getValidUser_S(_user, _isFromServer);

    const { constraints, required_on_create } = await getVerifiable_S(slug);
    const where = sanitizeWhere(rawWhere, constraints, required_on_create, _isFromServer);
    const insert = sanitizeInsert(rawInsert, constraints, required_on_create, false, _isFromServer);

    if (Object.keys(insert).length === 0) {
        return;
    }

    let whereQ = null;
    if (Object.keys(where).length > 0) {
        whereQ = genUW_S(where, [" = ", " AND "]);
    }

    if (!_ignoreVerifiedChecking) {
        const docs = await /* rdcProject */ readDoc_S(
            slug,
            where,
            undefined,
            user ?? undefined,
            _isFromServer,
            _accessor,
            { project: ["verified"] }
        );

        if (docs.length === 0) {
            return;
        } else {
            for (let i = 0; i < docs.length; i++) {
                if (docs[i].verified >= 1) {
                    throw new FormError(FormErrorEnum.NotAllowed);
                }
            }
        }
    }

    const insertQ: iCustomGenSQL = genUW_S(insert, [" = ", ", "]);
    try {
        if (_isFromServer && !_accessor) {
            if (!whereQ) {
                await drizzle.execute(
                    genSql_S`UPDATE ${r_S(`external_self_managed.${slug}`)} SET ${insertQ}`
                );
            } else {
                await drizzle.execute(
                    genSql_S`UPDATE ${r_S(`external_self_managed.${slug}`)} SET ${insertQ} WHERE ${whereQ}`
                );
            }
        } else {
            // There are only 2 option thus, this is safe
            const toQuery = _accessor && _isFromServer ? _accessor : [user!.email!];

            if (whereQ) {
                await drizzle.execute(
                    genSql_S`UPDATE ${r_S(`external_self_managed.${slug}`)} SET ${insertQ} WHERE ${genAccesor_S(toQuery)} AND ${whereQ}`
                );
            } else {
                await drizzle.execute(
                    genSql_S`UPDATE ${r_S(`external_self_managed.${slug}`)} SET ${insertQ} WHERE ${genAccesor_S(toQuery)}`
                );
            }
        }
    } catch (err: any) {
        if (err?.cause?.routine === "_bt_check_unique") {
            throw new FormError(FormErrorEnum.DuplicateDocuments);
        }
        throw err;
    }
}

/**
 * Deletes a Verifiable document.
 * @param {string} slug - The verifiable slug.
 * @param {UnsanitizedFormWhere} rawWhere - The targeting condition.
 * @param {AdminFormDeleteOption} [adminOption] - Admin options (cascade).
 * @param {User} [_user] - (Internal Backend Only) Optional user object to use instead of fetching from session. Use carefully.
 * @param {boolean} [_isFromServer=false] - (Internal Backend Only) Bypass checks. Use carefully.
 * @param {string[]} [_accessor] - (Internal Backend Only) Specific emails to check access for. Use carefully.
 * @returns {Promise<void>}
 * @throws {FormError} If deletion not allowed (verified) or dependencies exist (unless cascade).
 */
export async function deleteDoc_S(
    slug: string,
    rawWhere: UnsanitizedFormWhere,
    adminOption?: AdminFormDeleteOption,
    _user?: User,
    _isFromServer: boolean = false,
    _accessor?: string[]
) {
    if (adminOption && !_isFromServer) {
        // Check if admin
        if (!(await isAdmin_S())) {
            throw new ExpectedAuthError(ExpectedAuthErrorEnum.NotAdmin);
        }

        _isFromServer = true;
    }

    const user = await getValidUser_S(_user, _isFromServer);

    const { constraints, required_on_create, depended_by } = await getVerifiable_S(slug);
    const where = sanitizeWhere(rawWhere, constraints, required_on_create, _isFromServer);
    const allArr = [...constraints];
    if (required_on_create) {
        allArr.push(...required_on_create);
    }

    if (!_isFromServer) {
        where.creator = user!.email!;
    }
    const docs = await readDoc_S(slug, where, undefined, user ?? undefined, _isFromServer);
    if (docs.length === 0) {
        return;
    } else {
        const accessorSet = new Set<string>();

        for (let i = 0; i < docs.length; i++) {
            const doc = docs[i];
            if (!adminOption?.cascadeDelete && doc.verified >= 1) {
                throw new FormError(FormErrorEnum.NotAllowed);
            }

            accessorSet.add(doc.creator);
            doc.shared.forEach((email) => {
                accessorSet.add(email);
            });
        }

        const accessorEmails = [...accessorSet];
        // depended_by has a default value [] property thus not null
        for (let j = 0; j < depended_by!.length; j++) {
            if (adminOption?.cascadeDelete) {
                await deleteDoc_S(
                    depended_by![j].slug,
                    {},
                    adminOption,
                    undefined,
                    true,
                    accessorEmails
                );
            } else if (
                (
                    (await /** rdcCountOpt */ readDoc_S(
                        depended_by![j].slug,
                        {},
                        undefined,
                        undefined,
                        true,
                        accessorEmails,
                        { count: true }
                    )) as any
                )[0].length > 0
            ) {
                throw new FormError(FormErrorEnum.NotAllowed, "dependent by should be empty");
            }
        }
    }

    let whereQ = null;
    if (Object.keys(where).length > 0) {
        whereQ = genUW_S(where, [" = ", " AND "]);
    }

    if (_isFromServer && !_accessor) {
        if (!whereQ) {
            await drizzle.execute(genSql_S`DELETE FROM ${r_S(`external_self_managed.${slug}`)}`);
        } else {
            await drizzle.execute(
                genSql_S`DELETE FROM ${r_S(`external_self_managed.${slug}`)} WHERE ${whereQ}`
            );
        }
    } else {
        // There are only 2 option thus, this is safe
        const toQuery = _accessor && _isFromServer ? _accessor : [user!.email!];

        if (!whereQ) {
            await drizzle.execute(
                genSql_S`DELETE FROM ${r_S(`external_self_managed.${slug}`)} WHERE ${genAccesor_S(toQuery)}`
            );
        } else {
            await drizzle.execute(
                genSql_S`DELETE FROM ${r_S(`external_self_managed.${slug}`)} WHERE ${genAccesor_S(toQuery)} AND ${whereQ}`
            );
        }
    }

    for (let i = 0; i < docs.length; i++) {
        // Delete uploaded file
        const doc = docs[i];
        for (let j = 0; j < allArr.length; j++) {
            const { name, type } = allArr[j];
            if (type === "file" && typeof doc[name] === "string") {
                await deleteFile_S(doc[name], true);
            }
        }
    }
}

/**
 * Requests verification for a document.
 * Checks completeness and dependencies before updating status.
 * @param {string} slug - The verifiable slug.
 * @param {number} id - The document ID.
 * @returns {Promise<void>}
 * @throws {FormError} If doc not found, validation fails (null props), or deps unverified.
 */
export async function requestVerify_S(slug: string, id: number) {
    const doc = (await readDoc_S(slug, { id: id }))[0];

    if (!doc) {
        throw new FormError(FormErrorEnum.DocumentNotFound);
    }

    if (doc.verified >= 1) {
        return;
    }

    const { depends_on, constraints, required_on_create } = await getVerifiable_S(slug);

    const allArr = [...constraints];
    if (required_on_create) {
        allArr.push(...required_on_create);
    }

    for (const { name, type } of allArr) {
        if (
            doc[name] === null ||
            (type === "payment" && (doc[name] as string).startsWith("pending"))
        ) {
            throw new FormError(FormErrorEnum.VerificationFail, "null property");
        }
    }

    const accessorEmails = [doc.creator, ...doc.shared];

    if (depends_on) {
        if (
            (
                (await /** rdcCountVerBelOpt */ readDoc_S(
                    depends_on,
                    {},
                    undefined,
                    undefined,
                    true,
                    accessorEmails,
                    { count: true, verBel: 1 }
                )) as any
            )[0].length !== 0
        ) {
            throw new FormError(FormErrorEnum.VerificationFail, "dependencies unverified");
        }
    }

    await updateDoc_S(slug, { verified: 1 }, { id: id }, undefined, true);
}

/**
 * Sharing logic for documents.
 * Updates the shared list for a document.
 * @param {string} slug - The verifiable slug.
 * @param {number} id - The document ID.
 * @param {string[]} share - Emails to add.
 * @param {string[]} unshare - Emails to remove.
 * @param {User} [_user] - (Internal Backend Only) Optional user object to use instead of fetching from session. Use carefully.
 * @param {boolean} [_isFromServer=false] - (Internal Backend Only) Bypass checks. Use carefully.
 * @returns {Promise<void>}
 * @throws {FormError} If max shared limit reached or dependencies invalid.
 */
export async function shareDoc_S(
    slug: string,
    id: number,
    share: string[],
    unshare: string[],
    _user?: User,
    _isFromServer: boolean = false
) {
    const user = await getValidUser_S(_user, _isFromServer);

    const doc = (
        await /** rdcProjectOpt */ readDoc_S(
            slug,
            { id: id },
            undefined,
            user ?? undefined,
            _isFromServer,
            undefined,
            { project: ["creator", "shared", "verified"] }
        )
    )[0];
    if (!doc) {
        throw new FormError(FormErrorEnum.DocumentNotFound);
    }
    const { singleton, depends_on, max_shared } = await getVerifiable_S(slug);

    if (!_isFromServer) {
        share = [];
        if (user!.email !== doc.creator) {
            unshare = unshare.filter((email) => email === user!.email);
        }
    }

    const newObj: Record<string, boolean> = {};
    for (let i = 0; i < doc.shared.length; i++) {
        newObj[doc.shared[i] as string] = true;
    }

    for (let i = 0; i < unshare.length; i++) {
        newObj[unshare[i]] = false;
    }

    for (let i = 0; i < share.length; i++) {
        const now = share[i];
        if (
            singleton &&
            (
                await /** rdcCountOpt */ readDoc_S(slug, {}, undefined, undefined, true, [now], {
                    count: true,
                })
            )[0].length !== 0
        ) {
            throw new FormError(FormErrorEnum.DuplicateDocuments);
        }
        if (newObj[now] === undefined && now !== doc.creator) {
            if (depends_on) {
                let ada = false;
                (
                    await /** rdcProject */ readDoc_S(
                        depends_on,
                        {},
                        undefined,
                        undefined,
                        true,
                        [now],
                        { project: ["verified"] }
                    )
                ).filter((row) => {
                    ada = true;
                    if (doc.verified >= 1 && row.verified < 1) {
                        throw new FormError(
                            FormErrorEnum.VerificationFail,
                            "dependencies should be requested for verify"
                        );
                    }
                });
                if (!ada) {
                    throw new FormError(FormErrorEnum.DocumentNotFound);
                }
            }

            newObj[now] = true;
        }
    }

    const out: string[] = [];
    for (const key in newObj) {
        if (newObj[key] === true) {
            out.push(key);
        }
    }

    if (out.length > max_shared) {
        throw new FormError(FormErrorEnum.SharedExceedLimit);
    }

    await updateDoc_S(slug, { shared: out }, { id: id }, user ?? undefined, true, true);
}

/**
 * Checks if a specific accessor has any verified documents of a given slug.
 * @param {string} slug - The verifiable slug.
 * @param {string} accessor - The email to check.
 * @returns {Promise<number | null>} The verified status (e.g., 2) or null.
 */
export async function isAccessorVerified_S(slug: string, accessor: string) {
    let out = 999;
    const docs = await /** rdcProjectOpt */ readDoc_S(
        slug,
        {},
        undefined,
        undefined,
        true,
        [accessor],
        { project: ["verified"] }
    );
    for (let i = 0; i < docs.length; i++) {
        out = Math.min(out, docs[i].verified);
    }
    return out === 999 ? null : out;
}

/**
 * Joins a document using its unique verifiable code.
 * @param {string} fullVerifiableCode - The code to join.
 * @returns {Promise<void>}
 * @throws {FormError} If code invalid (InvalidCode).
 */
export async function joinWithVerifiableCode_S(fullVerifiableCode: string) {
    const user = await getValidUser_S(undefined, undefined);
    if (!user) {
        throw new ExpectedAuthError(ExpectedAuthErrorEnum.Unauthenticated);
    }
    const { verifiableCode, docId } = decodeFullVerifiableCode(fullVerifiableCode);

    // Check if the verifiable exists
    const verifiable = (
        await payload.find({
            collection: "verifiable",
            where: {
                verifiable_code: {
                    equals: verifiableCode,
                },
            },
        })
    ).docs[0];

    if (!verifiable) {
        throw new FormError(FormErrorEnum.InvalidCode);
    }

    // Check if the doc exists
    const doc = (
        await /** rdcProjectOpt */ readDoc_S(
            verifiable.slug,
            { id: docId },
            undefined,
            undefined,
            true,
            undefined,
            {
                project: ["id"],
            }
        )
    )[0];

    if (!doc) {
        throw new FormError(FormErrorEnum.InvalidCode);
    }

    // Share doc
    await shareDoc_S(verifiable.slug, doc.id, [user.email!], [], undefined, true);
}

/**
 * Verifies (Approve) or Rejects a document (Admin only).
 * Handles dependency checks on verification and cascading invalidation on rejection.
 * @param {string} slug - The verifiable slug.
 * @param {number} id - The document ID.
 * @param {boolean} verdict - True to verify (2), False to reject (-1).
 * @param {string} message_subject - Feedback subject.
 * @param {string} message_body - Feedback body.
 * @returns {Promise<void>}
 * @throws {FormError} If dependencies not accepted (VerificationFail) or status invalid.
 */
export async function verifyDoc_S(
    slug: string,
    id: number,
    verdict: boolean,
    message_subject: string,
    message_body: string
) {
    if (!(await isAdmin_S())) {
        throw new ExpectedAuthError(ExpectedAuthErrorEnum.NotAdmin);
    }

    const doc = (
        await /** rdcProjectOpt */ readDoc_S(
            slug,
            { id: id },
            undefined,
            undefined,
            true,
            undefined,
            { project: ["creator", "shared", "verified"] }
        )
    )[0];
    if (!doc) {
        throw new FormError(FormErrorEnum.DocumentNotFound);
    }

    if (doc.verified < 1 || (doc.verified === 2 && verdict)) {
        throw new FormError(FormErrorEnum.NotAllowed);
    }

    const accessorEmails = [doc.creator, ...doc.shared];

    const { depends_on, depended_by } = await getVerifiable_S(slug);
    if (verdict) {
        if (depends_on) {
            if (
                (
                    (
                        await /** rdcCountVerBelOpt */ readDoc_S(
                            depends_on,
                            {},
                            undefined,
                            undefined,
                            true,
                            accessorEmails,
                            { count: true, verBel: 2 }
                        )
                    )[0] as any
                ).length !== 0
            ) {
                throw new FormError(FormErrorEnum.VerificationFail, "dependencies unaccepted");
            }
        }

        await updateDoc_S(
            slug,
            { verified: 2, message_subject, message_body },
            { id: id },
            undefined,
            true,
            true
        );

        await sendEmail_S(accessorEmails, message_subject, message_body);
    } else {
        await updateDoc_S(
            slug,
            { verified: -1, message_subject, message_body },
            { id: id },
            undefined,
            true,
            true
        );

        // depended_by has a default value [] property thus not null
        const set = new Set<string>();
        for (let j = 0; j < depended_by!.length; j++) {
            await updateDoc_S(
                depended_by![j].slug,
                { verified: -1, message_subject, message_body },
                {},
                undefined,
                true,
                true,
                accessorEmails
            );
            (
                await readDoc_S(
                    depended_by![j].slug,
                    {},
                    undefined,
                    undefined,
                    true,
                    accessorEmails
                )
            ).forEach((nowDoc) => {
                set.add(nowDoc.creator);
                for (let l = 0; l < nowDoc.shared.length; l++) {
                    set.add(nowDoc.shared[l]);
                }
            });
        }

        await sendEmail_S([...set], message_subject, message_body);
    }
}

/**
 * Updates message/feedback for a document (Admin only).
 * @param {string} slug - The verifiable slug.
 * @param {number} id - The document ID.
 * @param {string} message_subject - Message subject.
 * @param {string} message_body - Message body.
 * @param {boolean} sendEmail - Whether to send email notification.
 * @returns {Promise<void>}
 */
export async function sendMessageToVerifiable_S(
    slug: string,
    id: number,
    message_subject: string,
    message_body: string,
    sendEmail: boolean
) {
    if (!(await isAdmin_S())) {
        throw new ExpectedAuthError(ExpectedAuthErrorEnum.NotAdmin);
    }

    const doc = (
        await /** rdcProjectOpt */ readDoc_S(
            slug,
            { id: id },
            undefined,
            undefined,
            true,
            undefined,
            { project: ["creator", "shared"] }
        )
    )[0];
    if (!doc) {
        throw new FormError(FormErrorEnum.DocumentNotFound);
    }

    const accessorEmails = [doc.creator, ...doc.shared];

    await updateDoc_S(slug, { message_subject, message_body }, { id: id }, undefined, true, true);

    if (sendEmail) {
        await sendEmail_S(accessorEmails, message_subject, message_body);
    }
}
