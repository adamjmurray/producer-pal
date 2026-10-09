// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type BrowserItemHotswap,
  type BrowserItemLoad,
  type BrowserItemResolution,
  type DeviceDuplication,
  type PresetScope,
  REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { setRunningLiveMajorFromArgs } from "../../live-library/library-routes.ts";
import { registerNodeRoute } from "../node-request-protocol.ts";
import { requireString } from "../route-string-args.ts";
import { lookUpBrowserDevice } from "./browser/browser-device-lookup.ts";
import { lookUpBrowserPreset } from "./browser/browser-preset-lookup.ts";
import { unavailableReply } from "./remote-script-client.ts";
import { RemoteScriptTimeout } from "./remote-script-errors.ts";
import {
  failedChange,
  requestChange,
  requireExpiry,
} from "./forwarded/remote-script-change.ts";
import { registerRemoteScriptConvertRoute } from "./forwarded/remote-script-convert-route.ts";
import { registerRemoteScriptDeviceRoutes } from "./forwarded/remote-script-device-routes.ts";
import { registerRemoteScriptEnvelopeRoutes } from "./forwarded/remote-script-envelope-routes.ts";
import { registerRemoteScriptUndoRoutes } from "./forwarded/remote-script-undo-routes.ts";
import { registerRemoteScriptInstallRoute } from "./install/remote-script-install-route.ts";

/**
 * Register every route V8 uses to reach the remote script: loading a plug-in,
 * Max for Live device, or preset, copying a device, plus clip envelopes,
 * conversions, rack macros and undo, and the one that installs it. Every step
 * of a device call gets the time V8 has left (`expiresInMs`), not a limit of
 * its own.
 */
export function registerRemoteScriptRoutes(): void {
  registerNodeRoute(
    REMOTE_SCRIPT_ROUTES.resolve,
    (args) =>
      resolveWithin(args, (endsAt) =>
        lookUpBrowserDevice(requireString(args, "name"), endsAt),
      ),
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );

  registerNodeRoute(
    REMOTE_SCRIPT_ROUTES.resolvePreset,
    (args) => {
      // A name the browser lacks is read from the running Live's database.
      setRunningLiveMajorFromArgs(args);

      return resolveWithin(args, (endsAt) =>
        lookUpBrowserPreset(
          requireString(args, "name"),
          presetScope(args),
          endsAt,
        ),
      );
    },
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

  registerNodeRoute(
    REMOTE_SCRIPT_ROUTES.duplicateDevice,
    duplicateDevice,
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );

  registerRemoteScriptEnvelopeRoutes();
  registerRemoteScriptConvertRoute();
  registerRemoteScriptDeviceRoutes();
  registerRemoteScriptUndoRoutes();
  registerRemoteScriptInstallRoute();
}

/**
 * Load a resolved browser item onto an existing track. The remote script finds
 * the track by `trackName`; an older one that ignores it falls back to the index.
 * @param args - `{ type, path, trackIndex, trackName, expiresInMs }`
 * @returns Whether it loaded, an error worded for the model (`unfinished` when
 *   Live may have started the load anyway), or `available: false`
 */
async function loadBrowserItem(args: unknown): Promise<BrowserItemLoad> {
  const trackIndex = (args as Record<string, unknown> | null)?.trackIndex;

  if (typeof trackIndex !== "number") {
    throw new TypeError("trackIndex must be a number");
  }

  const reply = await requestChange({
    route: "/load",
    body: {
      type: requireString(args, "type"),
      path: requireString(args, "path"),
      track_index: trackIndex,
      track_name: requireString(args, "trackName"),
    },
    expiresInMs: requireExpiry(args),
  });

  if (!reply.available) {
    return unavailableReply(reply);
  }

  return reply.status === 200 ? { available: true } : failedChange(reply);
}

/**
 * Load a resolved browser item in place of the device at a Live path. The
 * remote script refuses when the device there no longer has `deviceName`.
 * @param args - `{ type, path, devicePath, deviceName, expiresInMs }`
 * @returns Whether Live replaced the device, an error worded for the model
 *   (`unfinished` when Live may have started the load anyway, `changed` when
 *   it had already changed the device), or `available: false`
 */
async function hotswapBrowserItem(args: unknown): Promise<BrowserItemHotswap> {
  const reply = await requestChange({
    route: "/hotswap",
    body: {
      type: requireString(args, "type"),
      path: requireString(args, "path"),
      device_path: requireString(args, "devicePath"),
      device_name: requireString(args, "deviceName"),
    },
    expiresInMs: requireExpiry(args),
  });

  if (!reply.available) {
    return unavailableReply(reply);
  }

  if (reply.status !== 200) {
    return reply.body.changed === true
      ? { ...failedChange(reply), changed: true }
      : failedChange(reply);
  }

  const device = reply.body.device as { replaced?: unknown } | undefined;

  return { available: true, replaced: device?.replaced === true };
}

/**
 * Copy the device at a Live path with Live's own duplicate_device. The remote
 * script refuses when the device there no longer has `deviceName`.
 * @param args - `{ devicePath, deviceName, expiresInMs }`
 * @returns Where the copy went, an error worded for the model (`unfinished`
 *   when Live may have made the copy anyway), or `available: false`
 */
async function duplicateDevice(args: unknown): Promise<DeviceDuplication> {
  const reply = await requestChange({
    route: "/device/duplicate",
    body: {
      device_path: requireString(args, "devicePath"),
      device_name: requireString(args, "deviceName"),
    },
    expiresInMs: requireExpiry(args),
  });

  if (!reply.available) {
    return unavailableReply(reply);
  }

  if (reply.status !== 200) {
    return failedChange(reply);
  }

  const index = (reply.body.device as { index?: unknown } | undefined)?.index;

  // Live copied it, but not saying where leaves nothing to find it by.
  return typeof index === "number"
    ? { available: true, index }
    : {
        available: true,
        error: "the remote script copied the device but didn't say where",
        unfinished: true,
      };
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
 * Run a lookup that must be done by the time V8 gave it. Running out of that
 * time is an answer for V8 to word, not a crash.
 * @param args - The route args, with `expiresInMs`
 * @param look - The lookup, given when it must be done, in epoch ms
 * @returns What it found, or an `outOfTime` error
 */
async function resolveWithin(
  args: unknown,
  look: (endsAt: number) => Promise<BrowserItemResolution>,
): Promise<BrowserItemResolution> {
  const endsAt = Date.now() + requireExpiry(args);

  try {
    return await look(endsAt);
  } catch (error) {
    if (error instanceof RemoteScriptTimeout) {
      return { available: true, error: error.message, outOfTime: true };
    }

    throw error;
  }
}
