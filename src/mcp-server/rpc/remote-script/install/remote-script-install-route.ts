// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  INSTALL_ROUTE_TIMEOUT_MS,
  type InstallReply,
  MANAGE_ROUTES,
} from "#src/tools/core/helpers/manage-contract.ts";
import { registerNodeRoute } from "../../node-request-protocol.ts";
import { optionalString } from "../../route-string-args.ts";
import { installRemoteScriptReply } from "./remote-script-install-reply.ts";

/**
 * Register the route V8 uses to install the remote script from the ppal-manage
 * tool. V8 has no filesystem, so the install runs here.
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
 * @returns The version and path installed, or why it wasn't
 */
function installFromRoute(args: unknown): Promise<InstallReply> {
  return installRemoteScriptReply(optionalString(args, "userLibrary"));
}
