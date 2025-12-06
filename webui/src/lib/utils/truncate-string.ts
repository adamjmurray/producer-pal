/**
 * Truncate a string to a maximum length, adding a suffix if truncated.
 *
 * @param {string | null | undefined} str - The string to truncate (or null/undefined)
 * @param {number} maxLength - Maximum length before truncation
 * @param {string} suffix - Suffix to add when truncated (default: "…")
 * @returns {string | null | undefined} The truncated string (or null/undefined if input was null/undefined)
 */
export function truncateString(
  str: string | null | undefined,
  maxLength: number,
  suffix = "…",
): string | null | undefined {
  if (str == null) return str;
  if (str.length <= maxLength) return str;
  const cutoff = Math.max(0, maxLength - suffix.length);

  return str.slice(0, cutoff) + suffix;
}
