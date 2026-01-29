import "server-only";
import { sql } from "drizzle-orm";
import { isArrayOfString_SC } from "./validation";

export interface iCustomGenSQL {
    custom: { str: string[]; params: any[]; mergeStr?: boolean };
}

export type tArraySQL = [any[], string];

export type SQLRow = {
    creator: string;
    shared: string[];
    id: number;
    verified: number;
    message_subject: string;
    message_body: string;
    verifiableCode: string;
} & { [key: string]: string | boolean | number | string[] };

export type ReccurSQLRow = {
    creator: string;
    shared: string[];
    id: number;
    verified: number;
    message_subject: string;
    message_body: string;
    verifiableCode: string;
    slug: string;
} & { [key: string]: string | boolean | number | string[] };

export type AdminSQLRow = {
    creator: string;
    shared: string[];
    id: number;
    verified: number;
    message_subject: string;
    message_body: string;
    total_count: number;
    _msyssec: string;
    _msysrevsec: string;
    verifiableCode: string;
    dependsOnArr: ReccurSQLRow[];
    dependedByArr: ReccurSQLRow[];
} & { [key: string]: string | boolean | number | ReccurSQLRow[] | string[] };

/**
 * Wrapper for raw SQL strings to be used in genSql_S.
 * @param {string | [any[], string]} val - The raw string or an array join definition.
 * @returns {SQL} The Drizzle SQL object.
 */
export function r_S(val: string | [any[], string]) {
    if (
        val instanceof Array &&
        val.length === 2 &&
        val[0] instanceof Array &&
        typeof val[1] === "string"
    ) {
        return sql.raw(val[0].join(val[1]));
    }

    return sql.raw(val as string);
}

/**
 * Generates a SQL condition to check if a user is the creator or in the shared list.
 * @param {string[]} accessor - Array of emails to check against.
 * @returns {iCustomGenSQL} The custom SQL generation object.
 */
export function genAccesor_S(accessor: string[]): iCustomGenSQL {
    const out: iCustomGenSQL = {
        custom: {
            str: [],
            params: [],
            mergeStr: true,
        },
    };

    for (let i = 0; i < accessor.length; i++) {
        const now = accessor[i];

        if (i === 0) {
            out.custom.str.push("(creator = ");
        }
        out.custom.str.push(" OR shared @> ARRAY[");
        if (i === accessor.length - 1) {
            out.custom.str.push("])");
        } else {
            out.custom.str.push("] OR creator = ");
        }

        out.custom.params.push(now, now);
    }
    return out;
}

/**
 * Generates SQL for Update/Where clauses from an object.
 * @param {any} obj - The object containing key-value pairs.
 * @param {[string, string]} sep - Key-Value separators (e.g., ["=", ", "]).
 * @returns {iCustomGenSQL} The custom SQL generation object.
 */
export function genUW_S(obj: any, sep: [string, string]): iCustomGenSQL {
    const uwSql: iCustomGenSQL = { custom: { str: [], params: [] } };
    const keys = Object.keys(obj);
    keys.forEach((key, idx) => {
        const value = obj[key];
        uwSql.custom.params.push(r_S(key), value);
        uwSql.custom.str.push(sep[0]);
        if (idx !== keys.length - 1) {
            uwSql.custom.str.push(sep[1]);
        }
    });
    return uwSql;
}

/**
 * Custom tagged template literal for generating safe SQL queries with Drizzle.
 * Handles automatic parameterization and custom objects like iCustomGenSQL.
 * @param {TemplateStringsArray} str - The template strings.
 * @param {...any} params - The interpolated parameters.
 * @returns {SQL} The constructed Drizzle SQL object.
 */
export function genSql_S(str: TemplateStringsArray, ...params: any) {
    const outStr = [];
    const outParam = [];
    let shouldMerge = false;
    for (let i = 0; i < params.length; i++) {
        const nowP = params[i];
        if (shouldMerge) {
            outStr[outStr.length - 1] += str[i];
            shouldMerge = false;
        } else {
            outStr.push(str[i]);
        }
        if (
            nowP instanceof Array &&
            nowP.length === 2 &&
            nowP[0] instanceof Array &&
            (nowP[1] instanceof String || typeof nowP[1] === "string")
        ) {
            for (let j = 0; j < nowP[0].length; j++) {
                const val = nowP[0][j];
                outParam.push(val);

                if (j < nowP[0].length - 1) {
                    outStr.push(nowP[1].toString());
                }
            }
        } else if (
            nowP.custom &&
            isArrayOfString_SC(nowP.custom.str) &&
            nowP.custom.params instanceof Array
        ) {
            // Handle iCustomGenSQL
            if (nowP.custom.mergeStr && outStr.length !== 0) {
                outStr[outStr.length - 1] += nowP.custom.str[0];
                outStr.push(...nowP.custom.str.slice(1));
                shouldMerge = true;
            } else {
                outStr.push(...nowP.custom.str);
            }
            outParam.push(...nowP.custom.params);
        } else {
            outParam.push(nowP);
        }
    }

    outStr.push(str[str.length - 1]);
    const sqlOut = sql(Object.assign({ raw: outStr }, outStr), ...outParam);
    return sqlOut;
}
