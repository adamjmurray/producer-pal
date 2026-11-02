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
 * @param manage - Whether the caller can use ppal-manage; the portal always can
 * @returns The reason, worded for the model
 */
export function outdatedReason(
  running: string | null,
  needs: string,
  asker: RemoteScriptAsker = "device",
  manage = true,
): string {
  const version = running == null ? "" : `running ${running}, `;

  return `the Producer Pal remote script is out of date (${version}needs ${needs} or later); ${updateHow(asker, manage)}, then restart Live`;
}

/**
 * What a call is told when the script is new enough by version but lacks a
 * route this build needs: another build of the same version.
 * @param running - The script's version
 * @param asker - Who is asking
 * @param manage - Whether the caller can use ppal-manage; the portal always can
 * @returns The reason, worded for the model
 */
export function differentBuildReason(
  running: string,
  asker: RemoteScriptAsker = "device",
  manage = true,
): string {
  const ours = asker === "portal" ? "this connector's" : "this device's";

  return `the Producer Pal remote script in Live (v${running}) is a different build than ${ours} and can't do this; ${updateHow(asker, manage)}, then restart Live`;
}

/**
 * No remote script to ask. `outdated` is set when one is running but too old:
 * callers fall back as for a missing script, and word it with `whyUnavailable`.
 */
export interface RemoteScriptUnavailable {
  available: false;
  /** Why it is too old, worded for the model. */
  outdated?: string;
  /**
   * The same reason for a caller without ppal-manage. Set with `outdated`, for
   * the device asker; V8 picks between them, since only it knows the caller.
   */
  outdatedWithoutManage?: string;
}

/**
 * Why a running remote script is too old, worded for this caller.
 * @param reply - The unavailable reply
 * @param manage - Whether the caller can use ppal-manage
 * @returns The out-of-date reason, or undefined when the script isn't running
 */
export function outdatedFor(
  reply: RemoteScriptUnavailable,
  manage: boolean,
): string | undefined {
  return manage
    ? reply.outdated
    : (reply.outdatedWithoutManage ?? reply.outdated);
}

/**
 * Why there is no remote script to ask.
 * @param reply - The unavailable reply
 * @param missing - What to say when none is running
 * @param manage - Whether the caller can use ppal-manage
 * @returns The out-of-date reason when the script is too old, else `missing`
 */
export function whyUnavailable(
  reply: RemoteScriptUnavailable,
  missing: string,
  manage: boolean,
): string {
  return outdatedFor(reply, manage) ?? missing;
}

/**
 * @param asker - Who is asking
 * @param manage - Whether the caller can use ppal-manage
 * @returns The instruction to update the script, before ", then restart Live"
 */
function updateHow(asker: RemoteScriptAsker, manage: boolean): string {
  if (asker === "portal") {
    return `update it with ${INSTALL_WITH_TOOL}`;
  }

  return manage
    ? `update it with ${INSTALL_WITH_TOOL} or in ${INSTALL_IN_CHAT_UI}`
    : `have the user update it in ${INSTALL_IN_CHAT_UI}`;
}
