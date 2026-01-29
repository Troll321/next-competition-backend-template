import "server-only";
import { getValidUser_S } from "../authentication/server";
import {
    FormError,
    FormErrorEnum,
    PaymentError,
    PaymentErrorEnum,
    SubmissionError,
    SubmissionErrorEnum,
} from "../errorHandler/class";
import { getVerifiable_S, readDoc_S, updateDoc_S } from "../form/server";
import {
    allowedToModify_S,
    getSubmission_S,
    getSubmittable_S,
    updateSubmission_S,
} from "../submission/server";
import { decodePaymentInfo_SC, encodePaymentInfo_SC } from "../utils/string";
import { IdrxAdapter } from "./idrxAdapter";

export type PaymentParam =
    | {
          type: "verifiable";
          slug: string; // On submission this is the submittableSlug
          docId: number;
          constraintName: string;
          amount: number;
      }
    | {
          type: "submission";
          slug: string; // On submission this is the submittableSlug
          docId: number;
          constraintName: string;
          amount: number;
          level: number;
      };

export type PaymentInfo =
    | {
          status: "pending";
          adapter: string;
          expiredDate: number;
          reference: string;
          paymentUrl: string;
      }
    | {
          status: "paid";
          adapter: string;
          paidDate: number;
          reference: string;
          paymentUrl: string;
      };

export interface PaymentAdapter {
    getPaymentInfo_S(paymentParam: PaymentParam): Promise<PaymentInfo>;
    checkAlreadyPaid_S(paymentInfo: PaymentInfo): Promise<PaymentInfo | false>;
}

/**
 * The object key === supplied adapterKey and should be unique
 * Please use safe name (alphanumeric lowercase underscore)
 */
const adapters: Record<string, PaymentAdapter> = {
    idrx: new IdrxAdapter("idrx"),
};

async function getPaymentInfo_S(paymentParam: PaymentParam) {
    const adapter = "idrx"; // Choose the adapter to use
    return await adapters[adapter].getPaymentInfo_S(paymentParam);
}

async function checkAlreadyPaid_S(paymentInfo: PaymentInfo) {
    const adapter = paymentInfo.adapter;
    return await adapters[adapter].checkAlreadyPaid_S(paymentInfo);
}

/**
 * Handles payment info updates or new payment requests.
 * @param {PaymentParam} paymentParam - Parameters defining the payment context.
 * @param {boolean} canMakeNew - Whether a new payment transaction can be initiated.
 * @param {string} [oldEncodedPaymentInfo] - Existing encoded payment info string. (This is what saved in DB)
 * @returns {Promise<string>} The encoded payment info string (updated or existing).
 * @throws {PaymentError} If new payment required but not allowed (NotAllowed).
 */
export async function requestPayment_S(
    paymentParam: PaymentParam,
    canMakeNew: boolean,
    oldEncodedPaymentInfo?: string
) {
    if (oldEncodedPaymentInfo) {
        const paymentInfo = decodePaymentInfo_SC(oldEncodedPaymentInfo);
        if (paymentInfo.status === "paid") {
            return oldEncodedPaymentInfo;
        }

        const newPaymentInfo = await checkAlreadyPaid_S(paymentInfo);
        if (newPaymentInfo) {
            return encodePaymentInfo_SC(newPaymentInfo);
        }

        const now = Date.now();
        if (now < paymentInfo.expiredDate) {
            return oldEncodedPaymentInfo;
        } else if (!canMakeNew) {
            return oldEncodedPaymentInfo;
        }
    }

    if (!canMakeNew) {
        throw new PaymentError(PaymentErrorEnum.NotAllowed);
    }
    return encodePaymentInfo_SC(await getPaymentInfo_S(paymentParam));
}

/**
 * Processes a payment for a Verifiable document constraint.
 * @param {string} slug - The verifiable slug.
 * @param {number} docId - The document ID.
 * @param {string} constraintName - The name of the payment constraint.
 * @param {boolean} checkOnly - If true, only checks status/expiration, doesn't mint new tx.
 * @param {boolean} [_isFromServer=false] - (Internal Backend Only) Bypass auth check. Use carefully.
 * @param {PaymentInfo} [_webhookCustomPaymentInfo] - (Internal Backend Only) Internal use for webhooks to force update. Use carefully.
 * @returns {Promise<string>} The encoded payment info.
 * @throws {FormError} If doc not found, constraint invalid, or update fails.
 */
export async function payToVerifiable_S(
    slug: string,
    docId: number,
    constraintName: string,
    checkOnly: boolean,
    _isFromServer: boolean = false,
    _webhookCustomPaymentInfo?: PaymentInfo
) {
    const user = await getValidUser_S(undefined, _isFromServer);
    const doc = (
        await readDoc_S(slug, { id: docId }, undefined, user ?? undefined, _isFromServer)
    )[0];
    if (!doc) {
        throw new FormError(FormErrorEnum.DocumentNotFound);
    }

    const { constraints, required_on_create } = await getVerifiable_S(slug);
    const allArr = [...constraints];
    if (required_on_create) {
        allArr.push(...required_on_create);
    }

    // Check constraint name
    let valid = false,
        amount = 0;
    for (let i = 0; i < allArr.length; i++) {
        const nowCons = allArr[i];
        if (nowCons.name === constraintName && nowCons.type === "payment") {
            valid = true;
            amount = nowCons.pay_amount;
            break;
        }
    }

    if (!valid) {
        throw new FormError(FormErrorEnum.InvalidInput, "constraint name");
    }

    const insertObj: Record<string, string> = {};
    if (!_webhookCustomPaymentInfo) {
        insertObj[constraintName] = await requestPayment_S(
            {
                type: "verifiable",
                constraintName,
                docId,
                slug,
                amount,
            },
            checkOnly ? false : doc.verified < 1,
            doc[constraintName] as string
        );
    } else {
        insertObj[constraintName] = encodePaymentInfo_SC(_webhookCustomPaymentInfo);
    }
    if (insertObj[constraintName] === doc[constraintName]) {
        return insertObj[constraintName];
    }

    // Payment is sensitive thus its should be updated whatever happens
    await updateDoc_S(slug, insertObj, { id: docId }, undefined, true, true);
    return insertObj[constraintName];
}

/**
 * Processes a payment for a Submission constraint.
 * @param {number} verifiableDocId - The ID of the verifiable document.
 * @param {string} submittableSlug - The submittable slug.
 * @param {string} constraintName - The payment constraint name.
 * @param {number} level - The level of the submission.
 * @param {boolean} checkOnly - If true, only checks status.
 * @param {boolean} [_isFromServer=false] - (Internal Backend Only) Bypass auth check. Use carefully.
 * @param {PaymentInfo} [_webhookCustomPaymentInfo] - (Internal Backend Only) Internal use for webhooks. Use carefully.
 * @returns {Promise<string>} The encoded payment info.
 * @throws {SubmissionError} If invalid level, constraint, or modification not allowed.
 */
export async function payToSubmission_S(
    verifiableDocId: number,
    submittableSlug: string,
    constraintName: string,
    level: number,
    checkOnly: boolean,
    _isFromServer: boolean = false,
    _webhookCustomPaymentInfo?: PaymentInfo
) {
    const submittable = await getSubmittable_S(submittableSlug);
    const user = await getValidUser_S(undefined, _isFromServer);

    const verifiableSlug = submittable.verifiable;
    const doc = await /** rdcCountOpt */ readDoc_S(
        verifiableSlug,
        { id: verifiableDocId },
        undefined,
        user ?? undefined,
        _isFromServer,
        undefined,
        { count: true }
    );
    if (doc[0].length === 0) {
        throw new FormError(FormErrorEnum.DocumentNotFound);
    }

    const submission = await getSubmission_S(
        verifiableDocId,
        submittableSlug,
        undefined,
        undefined,
        _isFromServer
    );

    // Check is level valid
    if (
        !submittable.levels[level - 1]?.constraints ||
        level < 1 ||
        (submission && level > submission.level) ||
        (!submission && level !== 1)
    ) {
        throw new SubmissionError(SubmissionErrorEnum.InvalidInput, "level");
    }
    const allArr = submittable.levels[level - 1].constraints;

    // Check constraint name
    let valid = false,
        amount = 0;
    for (let i = 0; i < allArr.length; i++) {
        const nowCons = allArr[i];
        if (nowCons.name === constraintName && nowCons.type === "payment") {
            valid = true;
            amount = nowCons.pay_amount;
            break;
        }
    }

    if (!valid) {
        throw new SubmissionError(SubmissionErrorEnum.InvalidInput, "constraint name");
    }

    let canMakeNew = true;
    if (!checkOnly) {
        try {
            await allowedToModify_S(submittable, submission);
        } catch {
            canMakeNew = false;
        }
    }

    const insertObj: Record<string, string> = {};
    if (!_webhookCustomPaymentInfo) {
        insertObj[constraintName] = await requestPayment_S(
            {
                type: "submission",
                constraintName,
                docId: verifiableDocId,
                slug: submittableSlug,
                level,
                amount,
            },
            checkOnly ? false : canMakeNew,
            submission?.levels[submission.level - 1]?.constraints[constraintName] as
                | undefined
                | string
        );
    } else {
        insertObj[constraintName] = encodePaymentInfo_SC(_webhookCustomPaymentInfo);
    }

    if (
        insertObj[constraintName] ===
        submission?.levels[submission.level - 1]?.constraints[constraintName]
    ) {
        return insertObj[constraintName];
    }
    // Payment is sensitive thus its should be updated whatever happens
    await updateSubmission_S(
        verifiableDocId,
        submittableSlug,
        insertObj,
        undefined,
        true,
        true,
        level
    );
    return insertObj[constraintName];
}
