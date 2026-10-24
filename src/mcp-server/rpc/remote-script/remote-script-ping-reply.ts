// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Reading a /ping reply into what the rest of the server uses.

import { type RemoteScriptPing } from "./remote-script-client.ts";

/**
 * Our script's ping, from a reply. Only a 200 with `ok` and `script_version`
 * counts: anything else is some other program on the port.
 * @param status - The reply's status
 * @param body - The reply's JSON body
 * @returns The ping, or null when it isn't our script answering
 */
export function pingFromReply(
  status: number,
  body: Record<string, unknown>,
): RemoteScriptPing | null {
  const scriptVersion = stringOrNull(body.script_version);

  if (status !== 200 || body.ok !== true || scriptVersion == null) {
    return null;
  }

  return {
    running: true,
    liveVersion: stringOrNull(body.live_version),
    scriptVersion,
    scriptBuild: stringOrNull(body.script_build),
    scriptCommit: stringOrNull(body.script_commit),
    userLibrary: stringOrNull(body.user_library),
    otherOnPort: null,
  };
}

/**
 * A ping reply for a remote script that isn't there.
 * @param otherOnPort - The port something else answered on, if it did
 * @returns The all-null reply
 */
export function notRunning(
  otherOnPort: number | null = null,
): RemoteScriptPing {
  return {
    running: false,
    liveVersion: null,
    scriptVersion: null,
    scriptBuild: null,
    scriptCommit: null,
    userLibrary: null,
    otherOnPort,
  };
}

/**
 * Narrow a reply field to a string.
 * @param value - The raw field
 * @returns The string, or null when it isn't one
 */
function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
