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

/**
 * Register the routes V8's create-device uses to load a plug-in or Max for
 * Live device through the remote script. Both outlast the remote script's own
 * 30s wait on Live.
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
}

/**
 * Load a resolved browser item onto an existing track. The remote script finds
 * the track by `trackName`; an older one that ignores it falls back to the index.
 * @param args - `{ type, path, trackIndex, trackName }`
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
      track_name: requireString(args, "trackName"),
    },
  });

  if (!reply.available) {
    return { available: false };
  }

  return reply.status === 200
    ? { available: true }
    : { available: true, error: replyError(reply) };
}
