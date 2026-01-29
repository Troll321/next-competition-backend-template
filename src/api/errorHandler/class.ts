export interface iExpectedErrorJSON {
    type: string;
    name: string;
    message: string;
    statusCode: number;
}
export class ExpectedError extends Error {
    httpStatusCode: number;
    type: string;

    static fromJSON(obj: iExpectedErrorJSON): ExpectedError {
        return new ExpectedError(obj.message, obj.type, obj.name, obj.statusCode);
    }

    static isSame(a: ExpectedError, b: ExpectedError) {
        if (!a.name || !a.type || !b.name || !b.type) {
            return false;
        }
        return a.name === b.name && a.type === b.type;
    }

    toErrorJson(): iExpectedErrorJSON {
        return {
            type: this.type,
            name: this.name,
            message: this.message,
            statusCode: this.httpStatusCode,
        };
    }

    constructor(message: string, type: string, name: string, httpStatusCode: number) {
        super(message);
        this.type = type;
        this.name = name;
        this.httpStatusCode = httpStatusCode;
    }
}

export enum HttpErrorEnum {
    NoConnection,
    ServerError,
    InvalidRequestBody,
    InvalidRequestParam,
}

export class HttpError extends ExpectedError {
    constructor(type: HttpErrorEnum) {
        let message = "",
            name = "",
            code = 0;
        switch (type) {
            case HttpErrorEnum.NoConnection:
                message = "Network error, can't establish connection";
                name = "NoConnection";
                code = 408;
                break;
            case HttpErrorEnum.ServerError:
                message = "Something went wrong";
                name = "ServerError";
                code = 500;
                break;
            case HttpErrorEnum.InvalidRequestBody:
                message = "Supplied request body is not valid";
                name = "InvalidRequestBody";
                code = 400;
                break;
            case HttpErrorEnum.InvalidRequestParam:
                message = "Supplied request param is not valid";
                name = "InvalidRequestParam";
                code = 400;
                break;
        }
        super(message, "HttpError", name, code);
    }
}

export enum FormErrorEnum {
    InvalidSlug,
    NecessaryFieldNotSupplied,
    ValueDifferentFromType,
    InvalidInput,
    DocumentNotFound,
    NotAllowed,
    DuplicateDocuments,
    VerificationFail,
    InvalidCode,
}

export class FormError extends ExpectedError {
    constructor(type: FormErrorEnum, meta?: any) {
        let message = "",
            name = "",
            code = 0;
        switch (type) {
            case FormErrorEnum.InvalidSlug:
                message = "Slug is invalid";
                name = "InvalidSlug";
                code = 404;
                break;
            case FormErrorEnum.NecessaryFieldNotSupplied:
                message = "Required on create / necessary field is not supplied";
                name = "NecessaryFieldNotSupplied";
                code = 400;
                break;
            case FormErrorEnum.ValueDifferentFromType:
                message = "Supplied field value is different from supposed type";
                name = "ValueDifferentFromType";
                code = 400;
                break;
            case FormErrorEnum.InvalidInput:
                message = `Input ${meta ? `"${meta}"` : " "}is invalid`;
                name = "InvalidInput";
                code = 400;
                break;
            case FormErrorEnum.DocumentNotFound:
                message = "Document not found";
                name = "DocumentNotFound";
                code = 404;
                break;
            case FormErrorEnum.NotAllowed:
                message = "This operation is currently not allowed" + (meta ? `: ${meta}` : "");
                name = "NotAllowed";
                code = 403;
                break;
            case FormErrorEnum.DuplicateDocuments:
                message = "To be created document already exists";
                name = "DuplicateDocuments";
                code = 400;
                break;
            case FormErrorEnum.VerificationFail:
                message = "Documents does not yet comply to requirements: " + (meta ? meta : "");
                name = "VerificationFail";
                code = 403;
                break;
            case FormErrorEnum.InvalidCode:
                message = "Supplied code is not valid";
                name = "InvalidCode";
                code = 404;
                break;
        }
        super(message, "FormError", name, code);
    }
}

export enum UploadErrorEnum {
    InvalidSQLURL,
    NotAllowed,
}

export class UploadError extends ExpectedError {
    constructor(type: UploadErrorEnum, meta?: any) {
        let message = "",
            name = "",
            code = 0;
        switch (type) {
            case UploadErrorEnum.InvalidSQLURL:
                message = "SQL URL is invalid";
                name = "InvalidSQLURL";
                code = 400;
                break;
            case UploadErrorEnum.NotAllowed:
                message = "Operation is not allowed";
                name = "NotAllowed";
                code = 403;
                break;
        }
        super(message, "UploadError", name, code);
    }
}

export enum ExpectedAuthErrorEnum {
    ThirdPartyError,
    InvalidRedirect,
    Unauthenticated,
    InvalidToken,
    EmailNotVerified,
    NotAdmin,
}

export class ExpectedAuthError extends ExpectedError {
    constructor(type: ExpectedAuthErrorEnum, meta?: any) {
        let message = "",
            name = "",
            code = 0;
        switch (type) {
            case ExpectedAuthErrorEnum.ThirdPartyError:
                message = "3rd party authentication is down right now";
                name = "ThirdPartyError";
                code = 501;
                break;
            case ExpectedAuthErrorEnum.InvalidRedirect:
                message = "Redirect URL Invalid";
                name = "InvalidRedirect";
                code = 400;
                break;
            case ExpectedAuthErrorEnum.Unauthenticated:
                message = "Unauthenticated";
                name = "Unauthenticated";
                code = 403;
                break;
            case ExpectedAuthErrorEnum.InvalidToken:
                message = "Supplied token is invalid";
                name = "InvalidToken";
                code = 403;
                break;
            case ExpectedAuthErrorEnum.EmailNotVerified:
                message = "Please verify your email first";
                name = "EmailNotVerified";
                code = 403;
                break;
            case ExpectedAuthErrorEnum.NotAdmin:
                message = "This operation requries admin clearance, and you are not admin";
                name = "NotAdmin";
                code = 403;
                break;
        }
        super(message, "ExpectedAuthError", name, code);
    }
}

export enum SubmissionErrorEnum {
    InvalidInput,
    InvalidSlug,
    NotAllowed,
    FinalLevel,
    LockFail,
    ValueDifferentFromType,
    SubmissionNotFound,
}

export class SubmissionError extends ExpectedError {
    constructor(type: SubmissionErrorEnum, meta?: any) {
        let message = "",
            name = "",
            code = 0;
        switch (type) {
            case SubmissionErrorEnum.InvalidInput:
                message = "Invalid input: " + (meta ? meta : "");
                name = "InvalidInput";
                code = 400;
                break;
            case SubmissionErrorEnum.InvalidSlug:
                message = "Submittable slug doesn't exists";
                name = "InvalidSlug";
                code = 400;
                break;
            case SubmissionErrorEnum.NotAllowed:
                message = "This operation is currently not allowed";
                name = "NotAllowed";
                code = 403;
                break;
            case SubmissionErrorEnum.FinalLevel:
                message = "All levels have been passed, can't make new submission";
                name = "FinalLevel";
                code = 400;
                break;
            case SubmissionErrorEnum.LockFail:
                message = "Document does not yet comply with the requirements";
                name = "LockFail";
                code = 403;
                break;
            case SubmissionErrorEnum.ValueDifferentFromType:
                message = "Supplied value is different from the expected type";
                name = "ValueDifferentFromType";
                code = 400;
                break;
            case SubmissionErrorEnum.SubmissionNotFound:
                message = "Submission not found";
                name = "SubmissionNotFound";
                code = 404;
                break;
        }
        super(message, "SubmissionError", name, code);
    }
}

export enum StringErrorEnum {
    InvalidBase36,
}

export class StringError extends ExpectedError {
    constructor(type: StringErrorEnum, meta?: any) {
        let message = "",
            name = "",
            code = 0;
        switch (type) {
            case StringErrorEnum.InvalidBase36:
                message = "Invalid input: ";
                name = "InvalidBase36";
                code = 400;
                break;
        }
        super(message, "StringError", name, code);
    }
}

export enum PaymentErrorEnum {
    InvalidEncodedPaymentInfo,
    InvalidWebhookKey,
    InvalidWebhookBody,
    NotAllowed,
    ThirdPartyError,
}

export class PaymentError extends ExpectedError {
    constructor(type: PaymentErrorEnum, meta?: any) {
        let message = "",
            name = "",
            code = 0;
        switch (type) {
            case PaymentErrorEnum.InvalidEncodedPaymentInfo:
                message = "Invalid input encoded payment info";
                name = "InvalidEncodedPaymentInfo";
                code = 400;
                break;
            case PaymentErrorEnum.InvalidWebhookKey:
                message = "Webhook key is invalid";
                name = "InvalidWebhookKey";
                code = 403;
                break;
            case PaymentErrorEnum.InvalidWebhookBody:
                message = "The webhook body is invalid";
                name = "InvalidWebhookBody";
                code = 400;
                break;
            case PaymentErrorEnum.NotAllowed:
                message = "This operation is not allowed (either already paid or can't be edited)";
                name = "NotAllowed";
                code = 403;
                break;
            case PaymentErrorEnum.ThirdPartyError:
                message = "3rd party payment gateway is down right now";
                name = "ThirdPartyError";
                code = 503;
                break;
        }
        super(message, "PaymentError", name, code);
    }
}
