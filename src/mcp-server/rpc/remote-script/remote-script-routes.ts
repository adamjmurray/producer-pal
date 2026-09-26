// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type BrowserItemHotswap,
  type BrowserItemLoad,
  type PresetScope,
  REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { registerNodeRoute } from "../node-request-protocol.ts";
import { requireString } from "../route-string-args.ts";
import { lookUpBrowserDevice } from "./browser-device-lookup.ts";
import { lookUpBrowserPreset } from "./browser-preset-lookup.ts";
import { remoteScriptRequest, replyError } from "./remote-script-client.ts";

/**
 * Register the routes V8 uses to load a plug-in, Max for Live device, or preset
 * through the remote script. All outlast the remote script's own 30s wait on
 * Live.
 */
export function registerRemoteScriptRoutes(): void {
  registerNodeRoute(
    REMOTE_SCRIPT_ROUTES.resolve,
    (args) => lookUpBrowserDevice(requireString(args, "name")),
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );

  registerNodeRoute(
    REMOTE_SCRIPT_ROUTES.resolvePreset,
    (args) =>
      lookUpBrowserPreset(requireString(args, "name"), presetScope(args)),
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );

  registerNodeRoute(
    REMOTE_SCRIPT_ROUTES.load,
    loadBrowserItem,
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );

  registerNodeRoute(
    REMOTE_SCRIPT_ROUTES.hotswap,
    hotswapBrowserItem,
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );
}

/**
 * Load a resolved browser item onto an existing track. The remote script finds
 * the track by `trackName`; an older one that ignores it falls back to the index.
 * @param args - `{ type, path, trackIndex, trackName, expiresInMs }`
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
      expires_in_ms: requireExpiry(args),
    },
  });

  if (!reply.available) {
    return { available: false };
  }

  return reply.status === 200
    ? { available: true }
    : { available: true, error: replyError(reply) };
}

/**
 * Load a resolved browser item in place of the device at a Live path. The
 * remote script refuses when the device there no longer has `deviceName`.
 * @param args - `{ type, path, devicePath, deviceName, expiresInMs }`
 * @returns Whether Live replaced the device, an error worded for the model, or
 *   `available: false`
 */
async function hotswapBrowserItem(args: unknown): Promise<BrowserItemHotswap> {
  const reply = await remoteScriptRequest({
    method: "POST",
    route: "/hotswap",
    body: {
      type: requireString(args, "type"),
      path: requireString(args, "path"),
      device_path: requireString(args, "devicePath"),
      device_name: requireString(args, "deviceName"),
      expires_in_ms: requireExpiry(args),
    },
  });

  if (!reply.available) {
    return { available: false };
  }

  if (reply.status !== 200) {
    return { available: true, error: replyError(reply) };
  }

  const device = reply.body.device as { replaced?: unknown } | undefined;

  return { available: true, replaced: device?.replaced === true };
}

/**
 * The device a preset name is searched under, when the call sent one.
 * @param args - The route args, maybe with
 *   `scope: { type, path, device, orAnywhere }`
 * @returns The scope, or undefined
 */
function presetScope(args: unknown): PresetScope | undefined {
  const scope = (args as Record<string, unknown> | null)?.scope;

  return scope == null
    ? undefined
    : {
        type: requireString(scope, "type"),
        path: requireString(scope, "path"),
        device: requireString(scope, "device"),
        orAnywhere: (scope as { orAnywhere?: unknown }).orAnywhere === true,
      };
}

/**
 * How long the remote script may leave a change queued before skipping it.
 * @param args - The route args, with `expiresInMs`
 * @returns The expiry, in ms
 */
function requireExpiry(args: unknown): number {
  const value = (args as Record<string, unknown> | null)?.expiresInMs;

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError("expiresInMs must be a number, 0 or more");
  }

  return value;
}
