// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// How V8 and Node word a remote script that answered but is too old for the
// call. Callers treat it as a missing script, and say this instead.

/**
 * What a call is told when the remote script answered but is too old for it.
 * @param running - The script's version, when known
 * @param needs - The least version that has what the call needs
 * @returns The reason, worded for the model
 */
export function outdatedReason(running: string | null, needs: string): string {
  const version = running == null ? "" : `running ${running}, `;

  return `the Producer Pal remote script is out of date (${version}needs ${needs} or later); update it in the Producer Pal chat UI's Settings → Remote Script, then restart Live`;
}

/**
 * No remote script to ask. `outdated` is set when one is running but too old:
 * callers fall back as for a missing script, and word it with `whyUnavailable`.
 */
export interface RemoteScriptUnavailable {
  available: false;
  /** Why it is too old, worded for the model. */
  outdated?: string;
}

/**
 * Why there is no remote script to ask.
 * @param reply - The unavailable reply
 * @param missing - What to say when none is running
 * @returns The out-of-date reason when the script is too old, else `missing`
 */
export function whyUnavailable(
  reply: RemoteScriptUnavailable,
  missing: string,
): string {
  return reply.outdated ?? missing;
}
