// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What a call is told when the device doesn't answer. It costs context on every
// offline call, so it stays short.

import { VERSION } from "#src/shared/config.ts";
import {
  formatErrorResponse,
  type McpResponse,
} from "#src/shared/mcp-responses.ts";
import { INSTALL_WITH_TOOL } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { type OfflineDeps } from "./offline-deps.ts";

const ADD_ACTION = 'action "add-producer-pal"';

export const SETUP_URL = "https://producer-pal.org/installation";

/**
 * Tell the caller what to do now that the device isn't answering. The remote
 * script tells the two cases apart: when it answers, Live is up and only the
 * device is missing.
 * @param manageOffered - Whether this portal lists ppal-manage
 * @param deps - The remote script ping
 * @returns The error response
 */
export async function offlineGuidance(
  manageOffered: boolean,
  deps: Pick<OfflineDeps, "ping">,
): Promise<McpResponse> {
  const { running } = await deps.ping();
  const text = running
    ? `❌ Producer Pal isn't in this Live Set.

${addDeviceHint(manageOffered)}`
    : `❌ Cannot connect to Ableton Live.

Ensure Ableton Live 12.3+ is running with the Producer Pal Max for Live device loaded.
Tell the user to check ${SETUP_URL} for setup instructions.${manageOffered ? installHint() : ""}`;

  return formatErrorResponse(`${text}

(Producer Pal ${VERSION})`);
}

/**
 * @param manageOffered - Whether this portal lists ppal-manage
 * @returns How to get the device into the Set
 */
function addDeviceHint(manageOffered: boolean): string {
  return manageOffered
    ? `Ask the user, then call ppal-manage ${ADD_ACTION}.`
    : `Tell the user to add the Producer Pal Max for Live device to it, per ${SETUP_URL}.`;
}

/** @returns The line pointing at what works without the device */
function installHint(): string {
  return `
Or run ${INSTALL_WITH_TOOL} now (it works without Producer Pal), then ask the user to restart Live and choose Producer Pal as a Control Surface. After that, ppal-manage ${ADD_ACTION} adds the device.`;
}
