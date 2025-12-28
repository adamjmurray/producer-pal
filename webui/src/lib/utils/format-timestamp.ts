/**
 * Formats a Unix timestamp for display in title attribute.
 * Uses locale-aware formatting for user's timezone.
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Locale-formatted date/time string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
