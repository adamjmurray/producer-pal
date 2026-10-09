// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { type CheckedManageArgs } from "#src/tools/core/helpers/manage-args.ts";
import { MANAGE_TOOL } from "../offline/offline-call.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { checkedManageArgs } from "../offline/offline-manage-args.ts";
import { offlineError } from "../offline/offline-responses.ts";
import { type RunningDevice } from "./running-device.ts";
import { updateProducerPal } from "./update-producer-pal.ts";

/**
 * Whether a tool call is one the portal answers itself rather than forwarding.
 * @param name - The tool called
 * @param args - Its arguments
 * @param manageOffered - Whether this portal lists ppal-manage
 * @returns True for ppal-manage update-producer-pal when it is offered
 */
export function isUpdateCall(
  name: string,
  args: Record<string, unknown>,
  manageOffered: boolean,
): boolean {
  return (
    manageOffered &&
    name === MANAGE_TOOL &&
    args.action === "update-producer-pal"
  );
}

/**
 * Answer a ppal-manage update-producer-pal call.
 * @param args - The call's arguments as sent
 * @param device - The bridge's connection to the running device
 * @param deps - What the update reaches out to
 * @returns The response
 */
export async function answerUpdateCall(
  args: Record<string, unknown>,
  device: RunningDevice,
  deps: OfflineDeps,
): Promise<McpResponse> {
  let checked: CheckedManageArgs;

  try {
    checked = checkedManageArgs(args);
  } catch (error) {
    return offlineError(errorMessage(error));
  }

  return await updateProducerPal(checked.userLibrary, device, deps);
}
