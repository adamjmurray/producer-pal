// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type BrowserItemLoad,
  REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { registerNodeRoute } from "../node-request-protocol.ts";
import { requireString } from "../route-string-args.ts";
import { lookUpBrowserDevice } from "./browser-device-lookup.ts";
import { remoteScriptRequest, replyError } from "./remote-script-client.ts";
import { registerRemoteScriptEnvelopeRoutes } from "./remote-script-envelope-routes.ts";

/**
 * Register every route V8 uses to reach the remote script: create-device's
 * plug-in and Max for Live device loading, plus clip envelopes. The device
 * routes outlast the remote script's own 30s wait on Live.
 */
export function registerRemoteScriptRoutes(): void {
  registerNodeRoute(
    REMOTE_SCRIPT_ROUTES.resolve,
    (args) => lookUpBrowserDevice(requireString(args, "name")),
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );

  registerNodeRoute(
    REMOTE_SCRIPT_ROUTES.load,
    loadBrowserItem,
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );

  registerRemoteScriptEnvelopeRoutes();
}

/**
 * Load a resolved browser item onto an existing track.
 * @param args - `{ type, path, trackIndex }`
 * @returns Whether it loaded, an error worded for the model, or `available: false`
 */
async function loadBrowserItem(args: unknown): Promise<BrowserItemLoad> {
  const trackIndex = (args as Record<string, unknown> | null)?.trackIndex;

  if (typeof trackIndex !== "number") {
    throw new TypeError("trackIndex must be a number");
  }

  const reply = await remoteScriptRequest({
    method: "POST",
    route: "/load",
    body: {
      type: requireString(args, "type"),
      path: requireString(args, "path"),
      track_index: trackIndex,
    },
  });

  if (!reply.available) {
    return { available: false };
  }

  return reply.status === 200
    ? { available: true }
    : { available: true, error: replyError(reply) };
}
