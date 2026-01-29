import { ALLOWED_LOGOUT_REDIRECTS, BASE_API_URL } from "../constants";
import { ExpectedAuthError, ExpectedAuthErrorEnum } from "../errorHandler/class";

/**
 * Generates the login URL with a returnTo parameter.
 * @param {string} [redirect="/"] - The path to redirect to after login. Must start with /.
 * @returns {string} The formatted login URL.
 * @throws {ExpectedAuthError} If the redirect path is invalid (InvalidRedirect).
 */
export function getLoginURL_SC(redirect: string = "/") {
    if (redirect[0] !== "/") {
        throw new ExpectedAuthError(ExpectedAuthErrorEnum.InvalidRedirect);
    }
    return `/auth/login?returnTo=${new URLSearchParams(`${BASE_API_URL}/authentication/login_handler?redirect=${redirect}`)}`;
}

/**
 * Generates the logout URL with a returnTo parameter.
 * @param {string} [redirect="/"] - The path to redirect to after logout. Change ALLOWED_LOGOUT_REDIRECTS in constants.ts if option not found. Must be an allowed redirect.
 * @returns {string} The formatted logout URL.
 * @throws {ExpectedAuthError} If the redirect path is not in the allowlist (InvalidRedirect).
 */
export function getLogoutURL_SC(redirect: (typeof ALLOWED_LOGOUT_REDIRECTS)[number] = "/") {
    if (!ALLOWED_LOGOUT_REDIRECTS.includes(redirect)) {
        throw new ExpectedAuthError(ExpectedAuthErrorEnum.InvalidRedirect);
    }
    return `/auth/logout?federated&returnTo=${process.env.NEXT_PUBLIC_APP_BASE_URL}${redirect}`;
}
