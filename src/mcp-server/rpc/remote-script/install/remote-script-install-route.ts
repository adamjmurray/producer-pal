// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  INSTALL_ROUTE_TIMEOUT_MS,
  type InstallReply,
  MANAGE_ROUTES,
} from "#src/tools/core/helpers/manage-contract.ts";
import { findUserLibraryPath } from "../../../live-library/query/user-library-path.ts";
import { registerNodeRoute } from "../../node-request-protocol.ts";
import { optionalString } from "../../route-string-args.ts";
import { installRunningDevicePart } from "../../device-install/running-device-install-part.ts";
import { syncDeviceInstallNotice } from "../../device-install/device-install-notice.ts";
import { installProducerPalReply } from "./producer-pal-install-reply.ts";
import { installRemoteScriptPart } from "./remote-script-install-reply.ts";

/**
 * Register the route V8 uses to install the remote script and this device from
 * the ppal-manage tool. V8 has no filesystem, so the install runs here.
 */
export function registerRemoteScriptInstallRoute(): void {
  registerNodeRoute(
    MANAGE_ROUTES.install,
    installFromRoute,
    INSTALL_ROUTE_TIMEOUT_MS,
  );
}

/**
 * @param args - `{ userLibrary? }`
 * @returns What became of the remote script and the device file
 */
async function installFromRoute(args: unknown): Promise<InstallReply> {
  const reply = await installProducerPalReply(
    optionalString(args, "userLibrary"),
    {
      findUserLibrary: findUserLibraryPath,
      installRemoteScript: installRemoteScriptPart,
      installDevice: installRunningDevicePart,
    },
  );

  if (reply.ran) {
    // The device's "Finish installation" notice may be done with.
    void syncDeviceInstallNotice();
  }

  return reply;
}
