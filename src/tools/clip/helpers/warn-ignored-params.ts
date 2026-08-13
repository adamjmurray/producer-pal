// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";

/**
 * Warn that the non-null entries of `params` were not applied.
 * @param params - Candidate parameters, keyed by their tool argument name
 * @param subject - What they were ignored for, completing "ignored for ..."
 */
export function warnIgnoredParams(
  params: Record<string, unknown>,
  subject: string,
): void {
  const ignored = Object.keys(params).filter((name) => params[name] != null);

  if (ignored.length === 0) return;

  console.warn(`${ignored.join(", ")} ignored for ${subject}`);
}
