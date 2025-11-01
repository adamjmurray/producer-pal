/**
 * Truncate a string to a maximum length, adding a suffix if truncated.
 *
 * @param str - The string to truncate
 * @param maxLength - Maximum length before truncation
 * @param suffix - Suffix to add when truncated (default: "…")
 * @returns The truncated string
 */
export function truncateString(
  str: string,
  maxLength: number,
  suffix = "…",
): string {
  if (str == null) return str;
  if (str.length <= maxLength) return str;
  const cutoff = Math.max(0, maxLength - suffix.length);
  return str.slice(0, cutoff) + suffix;
}
