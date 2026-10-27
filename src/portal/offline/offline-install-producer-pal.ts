// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// ppal-manage install-producer-pal in the portal: the remote script and the
// device that shipped with this portal go into the User Library, the same way
// the device's own route does it.

import { installProducerPalReply } from "#src/mcp-server/rpc/remote-script/install/producer-pal-install-reply.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { type InstallPart } from "#src/tools/core/helpers/manage-contract.ts";
import {
  manageInstallResult,
  type InstallContext,
} from "#src/tools/core/helpers/manage-install-result.ts";
import {
  installBundledDevice,
  requireBundledDevice,
} from "../setup/bundled-device-copy.ts";
import { installPartOfDevice } from "../setup/device-install-part.ts";
import { type SetupPurpose } from "../setup/setup-failure.ts";
import { type OfflineDeps } from "./offline-deps.ts";
import { firstUserLibrary } from "./offline-install-status.ts";
import { offlineError, offlineResult } from "./offline-responses.ts";

const INSTALL_DEVICE: SetupPurpose = {
  action: "install-producer-pal",
  doing: "installing the device",
  unchanged: "the device was not installed",
};

/**
 * Install the remote script and the bundled device into the User Library, the
 * one add-producer-pal and update-producer-pal use: the one the call gives,
 * else the one the running remote script reports, else the one Producer Pal
 * finds. Each file reports for itself, so one that installed isn't hidden by
 * one that didn't.
 * @param userLibrary - Absolute path to the User Library, if the call gave one
 * @param deps - The lookups and installs
 * @param context - Whether Producer Pal is running in the Live Set already
 * @returns Both outcomes and the next steps, or an error when neither installed
 */
export async function installProducerPal(
  userLibrary: string | undefined,
  deps: Pick<
    OfflineDeps,
    | "ping"
    | "findUserLibrary"
    | "findBundledDevice"
    | "installDevice"
    | "installRemoteScript"
  >,
  context: InstallContext,
): Promise<McpResponse> {
  try {
    const ping = await deps.ping();
    const reply = await installProducerPalReply(userLibrary, {
      findUserLibrary: () => firstUserLibrary([ping.userLibrary], deps),
      installRemoteScript: deps.installRemoteScript,
      installDevice: (folder) => installBundled(folder, deps),
    });

    return offlineResult(manageInstallResult(reply, context));
  } catch (error) {
    return offlineError(errorMessage(error));
  }
}

/**
 * @param library - Absolute path to the User Library
 * @param deps - The bundled device and the copy
 * @returns What became of the device file; never throws
 */
function installBundled(
  library: string,
  deps: Pick<OfflineDeps, "findBundledDevice" | "installDevice">,
): InstallPart {
  try {
    const bundled = requireBundledDevice(deps, INSTALL_DEVICE);
    const result = installBundledDevice(library, bundled, deps, INSTALL_DEVICE);

    return installPartOfDevice(result, "portal");
  } catch (error) {
    return { ok: false, detail: errorMessage(error) };
  }
}
