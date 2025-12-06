/**
 * Normalizes an error into a string message with "Error:" prefix
 * @param {unknown} error - Error object or message
 * @returns {string} Normalized error string with "Error:" prefix
 */
export function normalizeErrorMessage(error: unknown): string {
  console.error(error);
  let errorMessage = `${error}`;

  if (!errorMessage.startsWith("Error")) {
    errorMessage = `Error: ${errorMessage}`;
  }

  return errorMessage;
}
