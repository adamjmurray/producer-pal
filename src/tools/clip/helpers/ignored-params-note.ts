// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The note for a clip's entry saying which of the params sent did nothing on it.
 * @param params - Candidate parameters, keyed by their tool argument name
 * @param subject - What they were ignored for, completing "ignored for ..."
 * @returns The note, or null when every param was unset
 */
export function ignoredParamsNote(
  params: Record<string, unknown>,
  subject: string,
): string | null {
  const ignored = Object.keys(params).filter((name) => params[name] != null);

  return ignored.length === 0
    ? null
    : `${ignored.join(", ")} ignored for ${subject}`;
}
