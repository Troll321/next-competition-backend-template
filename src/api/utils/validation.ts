/**
 * Checks if the input is an array of strings.
 * @param {any} arr - The value to check.
 * @returns {boolean} True if the value is an array of strings, false otherwise.
 */
export function isArrayOfString_SC(arr: any) {
    if (arr && arr.constructor === Array) {
        for (let i = 0; i < arr.length; i++) {
            if (typeof arr[i] !== "string") {
                return false;
            }
        }

        return true;
    }
    return false;
}
