/**
 * Truncate a string to a maximum length, adding a suffix if truncated.
 *
 * @param {string} str - The string to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @param {string} suffix - Suffix to add when truncated (default: "…")
 * @returns {string} The truncated string
 */
export function truncateString(str, maxLength, suffix = "…") {
  if (str == null) return str;
  if (str.length <= maxLength) return str;
  const cutoff = Math.max(0, maxLength - suffix.length);
  return str.slice(0, cutoff) + suffix;
}
