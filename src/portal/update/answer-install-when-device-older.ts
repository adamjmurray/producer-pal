// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { type CheckedManageArgs } from "#src/tools/core/helpers/manage-args.ts";
import { canonicalManageAction } from "#src/tools/core/helpers/manage-contract.ts";
import { MANAGE_TOOL } from "../offline/offline-call.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { installProducerPal } from "../offline/offline-install-producer-pal.ts";
import { checkedManageArgs } from "../offline/offline-manage-args.ts";
import { offlineError } from "../offline/offline-responses.ts";
import { olderDevice } from "./older-device.ts";
import { type RunningDevice } from "./running-device.ts";

/**
 * Answer ppal-manage install-producer-pal from the portal when the running
 * device is older than it, under either name (an older device advertises the
 * retired one). An older device would install its own older script and device,
 * and an update that needs a newer one would loop.
 * @param call - The tool called
 * @param call.name - The tool called
 * @param call.args - Its arguments
 * @param call.manageOffered - Whether this portal lists ppal-manage
 * @param device - The bridge's connection to the running device
 * @param deps - What the install reaches out to
 * @returns The response, or null when the device should answer it
 */
export async function answerInstallWhenDeviceOlder(
  call: { name: string; args: Record<string, unknown>; manageOffered: boolean },
  device: RunningDevice,
  deps: OfflineDeps,
): Promise<McpResponse | null> {
  if (
    !call.manageOffered ||
    call.name !== MANAGE_TOOL ||
    canonicalManageAction(call.args.action) !== "install-producer-pal"
  ) {
    return null;
  }

  try {
    // Not connected yet (the tool list may have come from the portal's own
    // catalog): the version is unknown until we ask, and a forward could reach
    // an older device.
    if (device.version() == null) {
      await device.connect();
    }

    if ((await olderDevice(device)) == null) {
      return null;
    }
  } catch {
    // Not reachable: the offline path answers.
    return null;
  }

  let checked: CheckedManageArgs;

  try {
    checked = checkedManageArgs(call.args);
  } catch (error) {
    return offlineError(errorMessage(error));
  }

  return await installProducerPal(checked.userLibrary, deps, { running: true });
}
