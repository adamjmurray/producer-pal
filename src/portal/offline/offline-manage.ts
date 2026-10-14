// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// ppal-manage while the device is offline. The portal answers what needs only
// the files on this machine; the rest gets the setup guidance.

import { errorMessage } from "#src/shared/error-message.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { type CheckedManageArgs } from "#src/tools/core/helpers/manage-args.ts";
import { manageInstallResult } from "#src/tools/core/helpers/manage-contract.ts";
import { type OfflineDeps } from "./offline-deps.ts";
import { addProducerPal } from "./offline-add-producer-pal.ts";
import { checkedManageArgs } from "./offline-manage-args.ts";
import { offlineError, offlineResult } from "./offline-responses.ts";

/**
 * Run a ppal-manage call the portal can answer without the device.
 * @param args - The call's arguments as sent
 * @param connect - Connect to the device's server; throws until it answers
 * @param deps - What the answers reach out to
 * @returns The response, or null when only the device can answer (undo, redo)
 */
export async function offlineManage(
  args: Record<string, unknown>,
  connect: () => Promise<void>,
  deps: OfflineDeps,
): Promise<McpResponse | null> {
  let checked: CheckedManageArgs;

  try {
    checked = checkedManageArgs(args);
  } catch (error) {
    return offlineError(errorMessage(error));
  }

  if (checked.action === "install-remote-script") {
    return await installRemoteScript(checked.userLibrary, deps);
  }

  if (checked.action === "add-producer-pal") {
    return await addProducerPal(checked.userLibrary, connect, deps);
  }

  return null;
}

/**
 * @param userLibrary - Absolute path to the User Library, if the call gave one
 * @param deps - The install
 * @returns The same result or error the device's install gives
 */
async function installRemoteScript(
  userLibrary: string | undefined,
  deps: Pick<OfflineDeps, "installRemoteScript">,
): Promise<McpResponse> {
  try {
    return offlineResult(
      manageInstallResult(await deps.installRemoteScript(userLibrary)),
    );
  } catch (error) {
    return offlineError(errorMessage(error));
  }
}
