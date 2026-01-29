import "server-only";
import { NextResponse } from "next/server";
import { ExpectedError, HttpError, HttpErrorEnum } from "./class";

/**
 * Placeholder function for the to be implemented server side error handler.
 * @param {Error} err - The error object.
 */
export function errorHandler_S(err: Error) {
    console.log(err);
}

/**
 * Transforms errors into structured HTTP JSON responses for the client.
 * Handles both known `ExpectedError`s and unknown system errors.
 * @param {any} _err - (Internal Backend Only) The caught error. Use carefully.
 * @returns {NextResponse} The JSON response with appropriate status code.
 */
export function httpErrorHandler_S(_err: any) {
    let err;
    if (!(_err instanceof ExpectedError)) {
        err = new HttpError(HttpErrorEnum.ServerError);
    } else {
        err = _err;
    }
    return NextResponse.json(err.toErrorJson(), { status: err.httpStatusCode });
}
