// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  RACK_MACROS_ROUTE,
  REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
} from "#src/tools/shared/remote-script/rack-macros-contract.ts";
import { type RouteReply } from "#src/tools/shared/remote-script/remote-script-route-contract.ts";
import { registerNodeRoute } from "../../node-request-protocol.ts";
import { forwardRemoteScriptRequest } from "./remote-script-forward.ts";

/**
 * Register the route V8 uses to ask the remote script which rack macros are
 * mapped. It forwards to `/device/macros`.
 */
export function registerRemoteScriptDeviceRoutes(): void {
  registerNodeRoute(
    RACK_MACROS_ROUTE,
    forwardRackMacrosRequest,
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );
}

// --- Helpers below main exports ---

/**
 * Forward one rack macros request to the remote script.
 * @param args - `{ devicePaths }`, in V8's spelling
 * @returns The remote script's JSON, an error worded for the model, or
 *   `available: false` when nothing answered
 * @throws Error when `devicePaths` isn't a list of strings, or the remote
 *   script took the request but never answered
 */
async function forwardRackMacrosRequest(
  args: unknown,
): Promise<RouteReply<Record<string, unknown>>> {
  const paths = (args as Record<string, unknown> | null)?.devicePaths;

  if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) {
    throw new TypeError("devicePaths must be a list of strings");
  }

  // The route only answers 400 itself, so a 404 is an older script that
  // doesn't have it: the same as none running.
  return await forwardRemoteScriptRequest(
    "/device/macros",
    { device_paths: paths },
    true,
  );
}
