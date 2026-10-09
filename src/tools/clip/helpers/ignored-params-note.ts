// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { ignoredText } from "#src/shared/max/ignored-wording.ts";

/**
 * The note for a clip's entry saying which of the params sent did nothing on it.
 * @param params - Candidate parameters, keyed by their tool argument name
 * @param why - Why they did nothing
 * @returns The note, or null when every param was unset
 */
export function ignoredParamsNote(
  params: Record<string, unknown>,
  why: string,
): string | null {
  const ignored = Object.keys(params).filter((name) => params[name] != null);

  return ignored.length === 0 ? null : ignoredText(ignored, why);
}
