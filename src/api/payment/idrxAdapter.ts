import { ExpectedError, PaymentError, PaymentErrorEnum } from "../errorHandler/class";
import { base64UrlEncode_SC } from "../utils/string";
import { PaymentAdapter, PaymentInfo, PaymentParam } from "./server";

async function generateIdrxSignature(text: string) {
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(process.env.IDRX_SECRET_KEY!),
        {
            name: "HMAC",
            hash: "SHA-256",
        },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(text));
    const bytes = new Uint8Array(signature);
    return base64UrlEncode_SC(String.fromCharCode(...bytes));
}

export class IdrxAdapter implements PaymentAdapter {
    adapterKey: string;

    constructor(adapterKey: string) {
        this.adapterKey = adapterKey;
    }

    async getPaymentInfo_S(paymentParam: PaymentParam): Promise<PaymentInfo> {
        const paymentExpireM = parseInt(process.env.IDRX_PAYMENT_EXPIRE_PERIOD_M!);
        const now = Date.now();
        const url = `${process.env.IDRX_BASE_URL!}/api/transaction/mint-request`;
        const method = "POST";
        const body = {
            toBeMinted: paymentParam.amount.toString(),
            destinationWalletAddress: process.env.IDRX_WALLET_ADDRESS!,
            networkChainId: process.env.IDRX_BASE_CHAIN_ID!,
            expiryPeriod: paymentExpireM,
            requestType: "idrx",
            productDetails: `${process.env.IDRX_PRODUCT_DETAIL_DISPLAY_ORGANIZATION!} | ${paymentParam.slug}`,
        };
        const stringifiedBody = JSON.stringify(body);

        // Generate signature
        const signature = await generateIdrxSignature(
            [method, url, now.toString(), stringifiedBody].join("")
        );

        const res = await fetch(url, {
            method: method,
            headers: {
                "Content-Type": "application/json",
                "idrx-api-key": process.env.IDRX_API_KEY!,
                "idrx-api-sig": signature,
                "idrx-api-ts": now.toString(),
            },
            body: stringifiedBody,
        });

        try {
            const json = await res.json();

            if (process.env.NODE_ENV !== "production") {
                console.log("MINT TO IDRX:\n", json);
            }

            if (!res.ok || json.statusCode !== 200) {
                throw new PaymentError(PaymentErrorEnum.ThirdPartyError);
            }

            const { merchantOrderId, paymentUrl } = json.data;
            if (typeof merchantOrderId !== "string" || typeof paymentUrl !== "string") {
                throw new PaymentError(PaymentErrorEnum.ThirdPartyError);
            }

            return {
                status: "pending",
                adapter: this.adapterKey,
                expiredDate: now + paymentExpireM * 60 * 1000,
                reference: merchantOrderId,
                paymentUrl: paymentUrl,
            };
        } catch (err) {
            if (err instanceof ExpectedError) {
                throw err;
            }
            throw new PaymentError(PaymentErrorEnum.ThirdPartyError);
        }
    }

    async checkAlreadyPaid_S(paymentInfo: PaymentInfo): Promise<PaymentInfo | false> {
        const now = Date.now();
        const url = `${process.env.IDRX_BASE_URL!}/api/transaction/user-transaction-history`;
        const method = "GET";
        const body = {
            transactionType: "MINT",
            paymentStatus: "PAID",
            merchantOrderId: paymentInfo.reference,
            page: "1",
            take: "1",
        };
        const stringifiedBody = JSON.stringify(body);

        const signature = await generateIdrxSignature(
            [method, url, now.toString(), stringifiedBody].join("")
        );

        const res = await fetch(url + "?" + new URLSearchParams(body), {
            method: method,
            headers: {
                "Content-Type": "application/json",
                "idrx-api-key": process.env.IDRX_API_KEY!,
                "idrx-api-sig": signature,
                "idrx-api-ts": now.toString(),
            },
        });

        try {
            const json = await res.json();

            if (process.env.NODE_ENV !== "production") {
                console.log("CHECK ALREADY MINTED:\n", json);
            }

            if (!res.ok || json.statusCode !== 200 || json.records?.constructor !== Array) {
                throw new PaymentError(PaymentErrorEnum.ThirdPartyError);
            }

            if (json.records.length === 0) {
                return false;
            }

            return {
                status: "paid",
                adapter: this.adapterKey,
                paidDate: new Date(json.records[0].updatedAt).getTime(),
                reference: paymentInfo.reference,
                paymentUrl: `${process.env.IDRX_PAYMENT_BASE_URL!}${json.records[0].reference}`,
            };
        } catch (err) {
            if (err instanceof ExpectedError) {
                throw err;
            }
            throw new PaymentError(PaymentErrorEnum.ThirdPartyError);
        }
    }
}
