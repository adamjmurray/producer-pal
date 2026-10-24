// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// How V8 and Node word a remote script that answered but is too old for the
// call. Callers treat it as a missing script, and say this instead.

import {
  INSTALL_IN_CHAT_UI,
  INSTALL_WITH_TOOL,
} from "./remote-script-setup.ts";

/**
 * Who is asking the remote script. The portal never offers the chat UI's
 * Installation tab: the device serving it may be older than the portal, and
 * would install its own older script.
 */
export type RemoteScriptAsker = "device" | "portal";

/**
 * What a call is told when the remote script answered but is too old for it.
 * @param running - The script's version, when known
 * @param needs - The least version that has what the call needs
 * @param asker - Who is asking
 * @returns The reason, worded for the model
 */
export function outdatedReason(
  running: string | null,
  needs: string,
  asker: RemoteScriptAsker = "device",
): string {
  const version = running == null ? "" : `running ${running}, `;

  return `the Producer Pal remote script is out of date (${version}needs ${needs} or later); update it with ${updateWith(asker)}, then restart Live`;
}

/**
 * What a call is told when the script is new enough by version but lacks a
 * route this build needs: another build of the same version.
 * @param running - The script's version
 * @param asker - Who is asking
 * @returns The reason, worded for the model
 */
export function differentBuildReason(
  running: string,
  asker: RemoteScriptAsker = "device",
): string {
  const ours = asker === "portal" ? "this connector's" : "this device's";

  return `the Producer Pal remote script in Live (v${running}) is a different build than ${ours} and can't do this; update it with ${updateWith(asker)}, then restart Live`;
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

/**
 * @param asker - Who is asking
 * @returns How to update the script, as the rest of "update it with …"
 */
function updateWith(asker: RemoteScriptAsker): string {
  return asker === "portal"
    ? INSTALL_WITH_TOOL
    : `${INSTALL_WITH_TOOL} or in ${INSTALL_IN_CHAT_UI}`;
}
