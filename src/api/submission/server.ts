import "server-only";
import { readDoc_S } from "../form/server";
import { getCollection_S, getMongoDB_S } from "../utils/getMongodb";
import {
    ExpectedAuthError,
    ExpectedAuthErrorEnum,
    FormError,
    FormErrorEnum,
    SubmissionError,
    SubmissionErrorEnum,
} from "../errorHandler/class";
import { getPayloadClient_S } from "../utils/getPayload";
import { Submittable } from "../../../payload-types";
import { Collection, Db, Document, SortDirection } from "mongodb";
import { isAdmin_S } from "../authentication/server";
import { sendEmail_S } from "../utils/email";
import { SQLRow } from "../utils/sql";
import { deleteFile_S } from "../upload/server";

const payload: Awaited<ReturnType<typeof getPayloadClient_S>> = await getPayloadClient_S();
const db: Db = (await getMongoDB_S()).db("nesco_web");

export interface Submission {
    locked: number;
    level: number;
    verifiableId: number;
    message_subject: string;
    message_body: string;
    levels: {
        constraints: {
            [key: string]: string | number | boolean;
        };
    }[];
}

export interface AdminSubmission {
    data: Submission[];
    count: [{ count: number }];
}

export type UnsanitizedSubmissionInsert = Record<string, any>;
export type SubmissionInsert = Record<string, string | number | boolean>;

export interface AdminSubmissionReadOption {
    where: Record<string, any>;
    page: number;
    orderBy?: {
        field: string;
        isAsc: boolean;
    };
}

export interface AdminSubmissionDeleteOption {
    forceDelete: boolean;
}

/**
 * Fetches proper Submittable from Payload CMS.
 * @param {string} submittableSlug - The slug to find.
 * @returns {Promise<Submittable>} The submittable doc.
 * @throws {SubmissionError} If slug invalid (InvalidSlug).
 */
export async function getSubmittable_S(submittableSlug: string) {
    const submittable = (
        await payload.find({
            collection: "submittable",
            where: { slug: { equals: submittableSlug } },
        })
    ).docs[0];
    if (!submittable) {
        throw new SubmissionError(SubmissionErrorEnum.InvalidSlug);
    }
    return submittable;
}

async function validateParams(
    verifiableDocId: number,
    submittableSlug: string,
    _isFromServer: true
): Promise<null>;

async function validateParams(
    verifiableDocId: number,
    submittableSlug: string,
    _isFromServer?: false | undefined
): Promise<{ submittable: Submittable; doc: SQLRow }>;

async function validateParams(
    verifiableDocId: number,
    submittableSlug: string,
    _isFromServer: any
): Promise<{ submittable: Submittable; doc: SQLRow } | null>;

async function validateParams(
    verifiableDocId: number,
    submittableSlug: string,
    _isFromServer: boolean = false
) {
    if (_isFromServer) {
        return null;
    }

    const submittable = await getSubmittable_S(submittableSlug);
    const verifiableSlug = submittable.verifiable;

    const doc = (await readDoc_S(verifiableSlug, { id: verifiableDocId }))[0];
    if (!doc) {
        throw new FormError(FormErrorEnum.DocumentNotFound);
    }
    if (doc.verified < 2) {
        throw new SubmissionError(SubmissionErrorEnum.NotAllowed);
    }

    return { submittable, doc };
}

function validateType(type: string, toCompare: any) {
    if (type === "boolean" && typeof toCompare === "boolean") {
        return toCompare;
    } else if (type === "number" && typeof toCompare === "number" && Number.isInteger(toCompare)) {
        return toCompare;
    } else if (toCompare instanceof String || typeof toCompare === "string") {
        return toCompare.toString();
    } else {
        throw new SubmissionError(SubmissionErrorEnum.ValueDifferentFromType);
    }
}

function sanitizeInsert(
    insert: UnsanitizedSubmissionInsert,
    submittable: Submittable,
    submission?: Submission,
    _isFromServer: boolean = false
): SubmissionInsert {
    if (!insert || typeof insert !== "object") {
        throw new SubmissionError(SubmissionErrorEnum.InvalidInput, "insert");
    }
    const objOut: SubmissionInsert = {};
    let levelIndex = 0;
    if (submission) {
        levelIndex = submission.level - 1;
    }
    const { constraints } = submittable.levels[levelIndex];
    for (let i = 0; i < constraints.length; i++) {
        const { name, type, max_input_size_kb } = constraints[i];
        if (insert[name] !== undefined && insert[name] !== null) {
            if (!_isFromServer && (type === "file" || type === "payment")) {
                continue;
            }
            objOut[name] = validateType(type, insert[name]);
            if (
                type === "text" &&
                new Blob([objOut[name] as string]).size > max_input_size_kb * 1024
            ) {
                throw new SubmissionError(SubmissionErrorEnum.InvalidInput, "insert");
            }
        } else if (submission?.levels[levelIndex]?.constraints) {
            // Use the old value
            objOut[name] = submission.levels[levelIndex].constraints[name];
        }
    }
    return objOut;
}

/**
 * Checks if a submission modification is allowed based on date window and lock status.
 * @param {Submittable} submittable - The submittable config.
 * @param {Submission | null} submission - The current submission state. This will be null on updateSubmission for new submission.
 * @throws {SubmissionError} If outside date range (NotAllowed), final level reached (FinalLevel), or locked (NotAllowed).
 */
export async function allowedToModify_S(submittable: Submittable, submission: Submission | null) {
    let nowLevel;
    if (!submission) {
        nowLevel = submittable.levels[0];
    } else {
        nowLevel = submittable.levels[submission.level - 1];
    }

    const now = new Date();
    const isInTimeFrame = new Date(nowLevel.start_date) < now && now < new Date(nowLevel.end_date);
    if (!isInTimeFrame) {
        throw new SubmissionError(SubmissionErrorEnum.NotAllowed);
    }

    if (submission) {
        if (submission.level > submittable.levels.length) {
            throw new SubmissionError(SubmissionErrorEnum.FinalLevel);
        }

        if (submission.locked) {
            throw new SubmissionError(SubmissionErrorEnum.NotAllowed);
        }
    }
}

export async function getSubmission_S(
    verifiableDocId: number,
    submittableSlug: string,
    adminOption: AdminSubmissionReadOption,
    _collection?: Collection<Document>,
    _isFromServer?: boolean
): Promise<AdminSubmission>;

export async function getSubmission_S(
    verifiableDocId: number,
    submittableSlug: string,
    adminOption?: undefined,
    _collection?: Collection<Document>,
    _isFromServer?: boolean
): Promise<Submission | null>;

/**
 * Retrieves submission(s) from MongoDB.
 * @param {number} verifiableDocId - The identifier of the user's verifiable doc.
 * @param {string} submittableSlug - The slug of the submittable.
 * @param {AdminSubmissionReadOption} [adminOption] - Admin filtering/paging options.
 * @param {Collection<Document>} [_collection] - (Internal Backend Only) Optional injected collection. Use carefully.
 * @param {boolean} [_isFromServer=false] - (Internal Backend Only) Bypass checks. Use carefully.
 * @returns {Promise<AdminSubmission | Submission | null>} Admin object or single Submission.
 */
export async function getSubmission_S(
    verifiableDocId: number,
    submittableSlug: string,
    adminOption?: AdminSubmissionReadOption,
    _collection?: Collection<Document>,
    _isFromServer?: boolean
) {
    if (adminOption && !_isFromServer) {
        // Check if admin
        if (!(await isAdmin_S())) {
            throw new ExpectedAuthError(ExpectedAuthErrorEnum.NotAdmin);
        }

        _isFromServer = true;
    }

    await validateParams(verifiableDocId, submittableSlug, _isFromServer);
    const collection = _collection ? _collection : await getCollection_S(submittableSlug, db);

    if (adminOption) {
        const ADMIN_PAGING_LIMIT = parseInt(process.env.NEXT_PUBLIC_ADMIN_PAGING_LIMIT!);

        adminOption.page = Math.max(1, adminOption.page);

        const sortObj: Record<string, SortDirection> = {
            _id: 1,
        };
        if (adminOption.orderBy && adminOption.orderBy.field !== "_id") {
            sortObj[adminOption.orderBy.field] = adminOption.orderBy.isAsc ? 1 : -1;
        }

        return (
            await collection
                .aggregate<AdminSubmission>([
                    {
                        $facet: {
                            data: [
                                { $match: adminOption.where },
                                { $project: { _id: 0, __v: 0 } },
                                { $sort: sortObj },
                                { $skip: (adminOption.page - 1) * ADMIN_PAGING_LIMIT },
                                { $limit: ADMIN_PAGING_LIMIT },
                            ],
                            count: [{ $match: adminOption.where }, { $count: "count" }],
                        },
                    },
                ])
                .toArray()
        )[0];
    } else {
        return await collection.findOne<Submission>(
            { verifiableId: verifiableDocId },
            { projection: { _id: 0, __v: 0 } }
        );
    }
}

/**
 * Updates or creates a submission.
 * @param {number} verifiableDocId - The verifiable doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {UnsanitizedSubmissionInsert} rawInsert - The data to insert.
 * @param {Collection<Document>} [_collection] - (Internal Backend Only) Optional collection. Use carefully.
 * @param {boolean} [_isFromServer=false] - (Internal Backend Only) Bypass checks. Use carefully.
 * @param {boolean} [_ignoreModifyChecking=false] - (Internal Backend Only) Skip allowedToModify checks. Use carefully.
 * @param {number} [_overrideLevel] - (Internal Backend Only) Force update a specific level (Admin/Server use). Use carefully.
 * @returns {Promise<void>}
 */
export async function updateSubmission_S(
    verifiableDocId: number,
    submittableSlug: string,
    rawInsert: UnsanitizedSubmissionInsert,
    _collection?: Collection<Document>,
    _isFromServer?: boolean,
    _ignoreModifyChecking: boolean = false,
    _overrideLevel?: number
) {
    let submittable: Submittable;
    if (_isFromServer) {
        submittable = await getSubmittable_S(submittableSlug);
    } else {
        submittable = (await validateParams(verifiableDocId, submittableSlug, false))!.submittable;
    }

    const collection = _collection ? _collection : await getCollection_S(submittableSlug, db);
    const oldSubmission = await getSubmission_S(
        verifiableDocId,
        submittableSlug,
        undefined,
        collection,
        true
    );

    if (!_ignoreModifyChecking) {
        await allowedToModify_S(submittable, oldSubmission);
    }

    let newSubmission: Submission;

    // Create new levels and constraints
    if (oldSubmission === null || oldSubmission.levels.length === 0) {
        if (_overrideLevel !== undefined && _overrideLevel > 1) {
            throw new SubmissionError(SubmissionErrorEnum.InvalidSlug, "level");
        }

        // Set property default here
        const insert = sanitizeInsert(rawInsert, submittable, undefined, _isFromServer);
        newSubmission = {
            level: 1,
            locked: 0,
            verifiableId: verifiableDocId,
            message_body: "",
            message_subject: "",
            levels: [{ constraints: insert }],
        };
    } else {
        const insert = sanitizeInsert(rawInsert, submittable, oldSubmission, _isFromServer);
        const newLevels = oldSubmission.levels;

        let nowLevel = oldSubmission.level;

        if (_overrideLevel !== undefined) {
            if (_overrideLevel < 1 || _overrideLevel > nowLevel) {
                throw new SubmissionError(SubmissionErrorEnum.InvalidInput, "level");
            }
            nowLevel = _overrideLevel;
        }

        if (newLevels.length < nowLevel) {
            newLevels.push({ constraints: insert });
        } else {
            newLevels[nowLevel - 1].constraints = insert;
        }

        newSubmission = {
            level: oldSubmission.level,
            locked: oldSubmission.locked,
            verifiableId: oldSubmission.verifiableId,
            message_body: oldSubmission.message_body,
            message_subject: oldSubmission.message_subject,
            levels: newLevels,
        };
    }

    await collection.replaceOne(
        {
            verifiableId: verifiableDocId,
        },
        newSubmission,
        { upsert: true }
    );
}

/**
 * Locks the current level of a submission.
 * @param {number} verifiableDocId - The doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {Collection<Document>} [_collection] - (Internal Backend Only) Optional collection. Use carefully.
 * @param {boolean} [_isFromServer=false] - (Internal Backend Only) Bypass checks. Use carefully.
 * @returns {Promise<void>}
 * @throws {SubmissionError} If validation fails (LockFail).
 */
export async function lockSubmission_S(
    verifiableDocId: number,
    submittableSlug: string,
    _collection?: Collection<Document>,
    _isFromServer?: boolean
) {
    let submittable: Submittable;
    if (_isFromServer) {
        submittable = await getSubmittable_S(submittableSlug);
    } else {
        submittable = (await validateParams(verifiableDocId, submittableSlug, false))!.submittable;
    }

    const collection = _collection ? _collection : await getCollection_S(submittableSlug, db);
    const submission = await getSubmission_S(
        verifiableDocId,
        submittableSlug,
        undefined,
        collection,
        true
    );

    if (!submission) {
        return;
    }

    await allowedToModify_S(submittable, submission);

    const levelIndex = submission.level - 1;
    const { constraints } = submission.levels[levelIndex];

    for (let i = 0; i < submittable.levels[levelIndex].constraints.length; i++) {
        const { name, type } = submittable.levels[levelIndex].constraints[i];
        if (
            constraints[name] === undefined ||
            constraints[name] === null ||
            (type === "payment" && (constraints[name] as string).startsWith("pending"))
        ) {
            throw new SubmissionError(SubmissionErrorEnum.LockFail);
        }
    }

    await collection.updateOne(
        {
            verifiableId: verifiableDocId,
        },
        { $set: { locked: 1 } }
    );
}

/**
 * Reviews a submission (Admin only).
 * @param {number} verifiableDocId - The doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {boolean} verdict - Approve (next level) or Reject.
 * @param {string} message_subject - Message subject.
 * @param {string} message_body - Message body.
 * @returns {Promise<void>}
 */
export async function reviewSubmission_S(
    verifiableDocId: number,
    submittableSlug: string,
    verdict: boolean,
    message_subject: string,
    message_body: string
) {
    if (!(await isAdmin_S())) {
        throw new ExpectedAuthError(ExpectedAuthErrorEnum.NotAdmin);
    }

    const { submittable, doc } = (await validateParams(verifiableDocId, submittableSlug, false))!;
    const collection = await getCollection_S(submittableSlug, db);
    const submission = await getSubmission_S(
        verifiableDocId,
        submittableSlug,
        undefined,
        collection,
        true
    );

    if (!submission) {
        throw new SubmissionError(SubmissionErrorEnum.SubmissionNotFound);
    }

    const setObj: Record<string, number> = {};
    if (verdict) {
        setObj.level = submission.level + 1;
        if (submission.level === submittable.levels.length) {
            setObj.locked = 2;
        } else {
            setObj.locked = 0;
        }
    } else {
        setObj.locked = 2;
    }

    await collection.updateOne(
        {
            verifiableId: verifiableDocId,
        },
        { $set: setObj }
    );

    await sendEmail_S([doc.creator, ...doc.shared], message_subject, message_body);
}

/**
 * Deletes a submission and its files (Admin only).
 * @param {number} verifiableDocId - The doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {AdminSubmissionDeleteOption} adminOption - Options (must include forceDelete).
 * @returns {Promise<void>}
 */
export async function deleteSubmission_S(
    verifiableDocId: number,
    submittableSlug: string,
    adminOption: AdminSubmissionDeleteOption
) {
    if (adminOption.forceDelete) {
        // Check if admin
        if (!(await isAdmin_S())) {
            throw new ExpectedAuthError(ExpectedAuthErrorEnum.NotAdmin);
        }
    } else {
        return;
    }

    const { submittable } = await validateParams(verifiableDocId, submittableSlug);
    const collection = await getCollection_S(submittableSlug, db);

    const submission = await getSubmission_S(
        verifiableDocId,
        submittableSlug,
        undefined,
        collection,
        true
    );
    if (!submission) {
        throw new SubmissionError(SubmissionErrorEnum.SubmissionNotFound);
    }

    await collection.deleteOne({
        verifiableId: verifiableDocId,
    });

    for (let i = 0; i < submittable.levels.length; i++) {
        const { constraints } = submittable.levels[i];
        for (let j = 0; j < constraints.length; j++) {
            const { name, type } = constraints[j];
            const now = submission.levels[i].constraints[name];
            if (type === "file" && typeof now === "string") {
                deleteFile_S(now, true);
            }
        }
    }
}

/**
 * Updates the message of a submission and optionally sends an email (Admin only).
 * @param {number} verifiableDocId - The doc ID.
 * @param {string} submittableSlug - The submittable slug.
 * @param {string} message_subject - Message subject.
 * @param {string} message_body - Message body.
 * @param {boolean} sendEmail - Trigger email send.
 * @returns {Promise<void>}
 */
export async function sendMessageToSubmission_S(
    verifiableDocId: number,
    submittableSlug: string,
    message_subject: string,
    message_body: string,
    sendEmail: boolean
) {
    if (!(await isAdmin_S())) {
        throw new ExpectedAuthError(ExpectedAuthErrorEnum.NotAdmin);
    }

    const { doc } = (await validateParams(verifiableDocId, submittableSlug, false))!;
    const collection = await getCollection_S(submittableSlug, db);
    const submission = await getSubmission_S(
        verifiableDocId,
        submittableSlug,
        undefined,
        collection,
        true
    );

    if (!submission) {
        throw new SubmissionError(SubmissionErrorEnum.SubmissionNotFound);
    }

    await collection.updateOne(
        {
            verifiableId: verifiableDocId,
        },
        { $set: { message_subject, message_body } }
    );

    if (sendEmail) {
        await sendEmail_S([doc.creator, ...doc.shared], message_subject, message_body);
    }
}
