/**
 * Extract error message from an unknown caught error.
 * In strict mode, caught errors are typed as `unknown`.
 * @param {unknown} err - The caught error
 * @returns {string} - The error message
 */
export function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
