import {
    PaymentError,
    PaymentErrorEnum,
    StringError,
    StringErrorEnum,
    UploadError,
    UploadErrorEnum,
} from "../errorHandler/class";
import { PaymentInfo, PaymentParam } from "../payment/server";

/**
 * Base64 URL encodes a string.
 * @param {string} str - The string to encode.
 * @returns {string} The encoded string.
 */
export function base64UrlEncode_SC(str: string) {
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64 URL decodes a string.
 * @param {string} str - The string to decode.
 * @returns {string} The decoded string.
 */
export function base64UrlDecode_SC(str: string) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) {
        str += "=";
    }
    return atob(str);
}

const sqlUrlLimiter = `;;;`;
/**
 * Decodes a SQL URL format (adapter;;;path).
 * @param {string} sqlUrl - The encoded SQL URL.
 * @returns {{adapter: string, path: string}} The adapter and path components.
 * @throws {UploadError} If the format is invalid (InvalidSQLURL).
 */
export function decodeSQLURL_SC(sqlUrl: string) {
    const arr = sqlUrl.split(sqlUrlLimiter);
    const adapter = arr[0];
    arr.shift();
    if (arr.length === 0) {
        throw new UploadError(UploadErrorEnum.InvalidSQLURL);
    }
    return { adapter: adapter, path: arr.join(sqlUrlLimiter) };
}

/**
 * Encodes an adapter and path into a SQL URL.
 * @param {string} adapter - The adapter name.
 * @param {string} path - The path.
 * @returns {string} The encoded SQL URL.
 */
export function encodeSQLURL_SC(adapter: string, path: string) {
    return `${adapter}${sqlUrlLimiter}${path}`;
}

/**
 * Generates a unique file path for uploads.
 * Structure: base64(userId)/timestamp_base64(filename).ext
 * @param {string} userId - The uploader's ID.
 * @param {File} file - The file object.
 * @returns {string} The generated file path.
 */
export function encodeFilePath_SC(userId: string, file: File) {
    const fileName = file.name;
    const lastDot = fileName.lastIndexOf(".");
    let baseName, extension;
    if (lastDot === -1) {
        baseName = fileName;
        extension = "unknown";
    } else {
        baseName = lastDot === -1 ? fileName : fileName.slice(0, lastDot);
        extension = lastDot === -1 ? "" : fileName.slice(lastDot + 1);
    }
    return `${base64UrlEncode_SC(userId)}/${Date.now()}_${base64UrlEncode_SC(baseName)}.${extension}`;
}

/**
 * Decodes a file path to extract metadata.
 * @param {string} filePath - The file path to decode.
 * @returns {{userId: string, unixTime: string, fileName: string}} The extracted metadata.
 */
export function decodeFilePath_SC(filePath: string) {
    let arr = filePath.split("/");
    const userId = base64UrlDecode_SC(arr.shift()!);
    arr = arr.join("").split("_");
    const unixTime = arr.shift()!;
    const fileName = arr
        .join("")
        .split(".")
        .map((val, idx) => {
            if (idx === 0) {
                return base64UrlDecode_SC(val);
            }
            return val;
        })
        .join(".");
    return { userId, unixTime, fileName };
}

const A = 12887461,
    Ainv = 1250605,
    B = 23104027,
    MOD = 1679616; // 36 ^ 4

/**
 * Permutes a number using a linear congruential generator-like formula.
 * Used for obfuscating IDs.
 * @param {number} x - The number to permute.
 * @returns {number} The permuted number.
 */
export function permuteNumber_SC(x: number) {
    return (A * x + B) % MOD;
}

/**
 * Reverses the permutation applied by permuteNumber_SC.
 * @param {number} x - The permuted number.
 * @returns {number} The original number.
 */
export function unpermuteNumber_SC(x: number) {
    x = x - (B % MOD) + MOD;
    x %= MOD;
    x = (x * Ainv) % MOD;
    return x;
}

/**
 * Converts a number to a base-36 string.
 * @param {number} x - The number to convert.
 * @returns {string} The base-36 string representation.
 */
export function toBase36_SC(x: number) {
    if (x === 0) {
        return "0";
    }
    let out = "";
    while (x > 0) {
        const now = x % 36;
        if (now <= 9) {
            out += now.toString();
        } else {
            out += String.fromCharCode("A".charCodeAt(0) + (now - 10));
        }
        x = Math.floor(x / 36);
    }
    return out.split("").reverse().join("");
}

/**
 * Converts a base-36 string back to a number.
 * @param {string} x - The base-36 string.
 * @returns {number} The numeric value.
 * @throws {StringError} If the string contains invalid characters (InvalidBase36).
 */
export function fromBase36_SC(x: string) {
    let out = 0;
    let mul = 1;
    for (let i = x.length - 1; i >= 0; i--) {
        const myInt = parseInt(x[i]);
        if (isNaN(myInt)) {
            const charCode = x[i].charCodeAt(0);
            if (charCode < 65 || charCode > 90) {
                throw new StringError(StringErrorEnum.InvalidBase36);
            }
            out += mul * (x[i].charCodeAt(0) - "A".charCodeAt(0) + 10);
        } else {
            out += mul * myInt;
        }

        mul *= 36;
    }
    return out;
}

const paymentInfoLimiter = ";;;";
/**
 * Encodes payment information into a string.
 * @param {PaymentInfo} paymentInfo - The payment information object.
 * @returns {string} The encoded payment string.
 */
export function encodePaymentInfo_SC(paymentInfo: PaymentInfo) {
    if (paymentInfo.status === "pending") {
        return [
            paymentInfo.status,
            paymentInfo.adapter,
            paymentInfo.expiredDate.toString(),
            paymentInfo.reference,
            paymentInfo.paymentUrl,
        ].join(paymentInfoLimiter);
    }
    return [
        paymentInfo.status,
        paymentInfo.adapter,
        paymentInfo.paidDate.toString(),
        paymentInfo.reference,
        paymentInfo.paymentUrl,
    ].join(paymentInfoLimiter);
}
/**
 * Decodes a payment information string.
 * @param {string} encodedPaymentInfo - The encoded string.
 * @returns {PaymentInfo} The decoded PaymentInfo object.
 * @throws {PaymentError} If the format is invalid (InvalidEncodedPaymentInfo).
 */
export function decodePaymentInfo_SC(encodedPaymentInfo: string): PaymentInfo {
    const pInfoArr = encodedPaymentInfo.split(paymentInfoLimiter);
    if (pInfoArr.length < 5 || (pInfoArr[0] !== "pending" && pInfoArr[0] !== "paid")) {
        throw new PaymentError(PaymentErrorEnum.InvalidEncodedPaymentInfo);
    }

    let paymentInfo: PaymentInfo;
    if (pInfoArr[0] === "paid") {
        paymentInfo = {
            status: "paid",
            adapter: pInfoArr[1],
            paidDate: parseInt(pInfoArr[2]),
            reference: pInfoArr[3],
            paymentUrl: pInfoArr.slice(4).join(paymentInfoLimiter),
        };
        if (isNaN(paymentInfo.paidDate)) {
            throw new PaymentError(PaymentErrorEnum.InvalidEncodedPaymentInfo);
        }
    } else {
        paymentInfo = {
            status: "pending",
            adapter: pInfoArr[1],
            expiredDate: parseInt(pInfoArr[2]),
            reference: pInfoArr[3],
            paymentUrl: pInfoArr.slice(4).join(paymentInfoLimiter),
        };
        if (isNaN(paymentInfo.expiredDate)) {
            throw new PaymentError(PaymentErrorEnum.InvalidEncodedPaymentInfo);
        }
    }

    return paymentInfo;
}
