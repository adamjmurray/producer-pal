// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What a call is told when the device doesn't answer. It costs context on every
// offline call, so it stays short.

import { type RemoteScriptPing } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { outdatedScript } from "#src/mcp-server/rpc/remote-script/port/remote-script-version.ts";
import { VERSION } from "#src/shared/config.ts";
import {
  formatErrorResponse,
  type McpResponse,
} from "#src/shared/mcp-responses.ts";
import { type OfflineDeps } from "./offline-deps.ts";
import {
  offlineInstallStatus,
  type OfflineInstallStatus,
} from "./offline-install-status.ts";
import {
  notRunningHint,
  runningHint,
  SETUP_URL,
} from "./offline-setup-hints.ts";

/**
 * Tell the caller what to do now that the device isn't answering. The remote
 * script tells the two cases apart: when it answers, Live is up and only the
 * device is missing. With ppal-manage offered, it also says where things are
 * installed and what the next step will do.
 * @param manageOffered - Whether this portal lists ppal-manage
 * @param deps - The remote script ping and the install lookups
 * @returns The error response
 */
export async function offlineGuidance(
  manageOffered: boolean,
  deps: Pick<
    OfflineDeps,
    | "ping"
    | "findUserLibrary"
    | "findBundledDevice"
    | "installedRemoteScript"
    | "deviceFileStatus"
  >,
): Promise<McpResponse> {
  const ping = await deps.ping();
  const status = manageOffered
    ? await offlineInstallStatus(ping, deps)
    : undefined;
  const text = ping.running
    ? `❌ Producer Pal isn't in this Live Set.

${runningAdvice(manageOffered, ping, status)}`
    : `❌ Cannot connect to Ableton Live.

Ensure Ableton Live 12.3+ is running with the Producer Pal Max for Live device loaded.
Tell the user to check ${SETUP_URL} for setup instructions.${manageOffered ? notRunningHint(status) : ""}`;

  return formatErrorResponse(`${text}

(Producer Pal ${VERSION})`);
}

/**
 * @param manageOffered - Whether this portal lists ppal-manage
 * @param ping - The remote script's answer
 * @param status - What was found, if anything
 * @returns How to get the device into the Set
 */
function runningAdvice(
  manageOffered: boolean,
  ping: RemoteScriptPing,
  status: OfflineInstallStatus | undefined,
): string {
  return manageOffered
    ? runningHint(outdatedScript(ping.scriptVersion), status)
    : `Tell the user to add the Producer Pal Max for Live device to it, per ${SETUP_URL}.`;
}
