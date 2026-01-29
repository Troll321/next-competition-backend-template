"use client";
import "client-only";
import { BASE_API_URL } from "../constants";
import { ExpectedError, HttpError, HttpErrorEnum } from "../errorHandler/class";

type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Generic fetch wrapper for Client-Side API calls.
 * Handles headers, JSON parsing, and unified error throwing.
 * @template T
 * @param {string} path - The API endpoint path (relative to BASE_API_URL).
 * @param {HTTPMethod} method - The HTTP method.
 * @param {Record<string, string>} [query] - Optional query parameters.
 * @param {object} [body] - Optional request body (JSON object or FormData).
 * @returns {Promise<T>} The parsed JSON response.
 * @throws {HttpError} If connection fails (NoConnection) or server returns non-OK status.
 * @throws {ExpectedError} If the server returns a structured ExpectedError.
 */
export async function APIFetch_C<T>(
    path: string,
    method: HTTPMethod,
    query?: Record<string, string>,
    body?: object
): Promise<T> {
    let res: Response;
    try {
        const headers: Record<string, string> = {};

        if (!(body instanceof FormData)) {
            headers["Content-Type"] = "application/json";
        }

        res = await fetch(BASE_API_URL + path + (query ? "?" + new URLSearchParams(query) : ""), {
            method,
            headers: headers,
            body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
        });
    } catch {
        throw new HttpError(HttpErrorEnum.NoConnection);
    }

    if (!res.ok) {
        throw ExpectedError.fromJSON(await res.json());
    }
    return await res.json();
}
