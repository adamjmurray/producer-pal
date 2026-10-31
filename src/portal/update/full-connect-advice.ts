// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  VERSION_CHECK_CALL,
  VERSION_CHECK_NEVER_CONNECTED,
} from "#src/shared/version-check.ts";

/**
 * Whether a call, with the device's answer, was a plain `ppal-connect` that
 * worked: not a versionCheck, not an error. Only that loads the Skills, so until
 * one has passed through this portal, no chat on it can have connected.
 * @param call - The tool called and its arguments
 * @param call.name - The tool called
 * @param call.args - Its arguments as sent
 * @param result - What the device answered
 * @returns True for a successful plain connect
 */
export function isFullConnect(
  call: { name: string; args: Record<string, unknown> },
  result: object,
): boolean {
  return (
    call.name === "ppal-connect" &&
    call.args.versionCheck !== true &&
    (result as { isError?: unknown }).isError !== true
  );
}

// Where the portal's update flow tells the model to re-check versions. If no
// plain ppal-connect has gone through this portal, the chat can't have
// connected, and a version check would leave it without Skills: say only the
// plain connect. Once one has, it may have been another chat on a shared portal
// (Claude Desktop), so offer both.

/**
 * @param fullConnectSeen - Whether a plain ppal-connect has worked on this portal
 * @returns "call ...", ending the sentence, to follow "then" or a colon
 */
export function versionCheckSentence(fullConnectSeen: boolean): string {
  return fullConnectSeen
    ? `call ${VERSION_CHECK_CALL}. ${VERSION_CHECK_NEVER_CONNECTED}`
    : "call ppal-connect.";
}

/**
 * @param fullConnectSeen - Whether a plain ppal-connect has worked on this portal
 * @returns What to do once the update succeeded
 */
export function updatedNextSteps(fullConnectSeen: boolean): string {
  return fullConnectSeen
    ? `Now call ${VERSION_CHECK_CALL} to confirm the update. ${VERSION_CHECK_NEVER_CONNECTED}`
    : "Now call ppal-connect to load the Skills and confirm the update.";
}
