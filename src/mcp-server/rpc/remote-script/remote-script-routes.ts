// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type BrowserItemHotswap,
  type BrowserItemLoad,
  type BrowserItemResolution,
  type PresetScope,
  REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { setRunningLiveMajorFromArgs } from "../../live-library/library-routes.ts";
import { registerNodeRoute } from "../node-request-protocol.ts";
import { requireString } from "../route-string-args.ts";
import { lookUpBrowserDevice } from "./browser-device-lookup.ts";
import { lookUpBrowserPreset } from "./browser-preset-lookup.ts";
import {
  type RemoteScriptAnswer,
  type RemoteScriptReply,
  RemoteScriptTimeout,
  remoteScriptRequest,
  replyError,
} from "./remote-script-client.ts";
import { registerRemoteScriptDeviceRoutes } from "./forwarded/remote-script-device-routes.ts";
import { registerRemoteScriptEnvelopeRoutes } from "./forwarded/remote-script-envelope-routes.ts";

/**
 * Register every route V8 uses to reach the remote script: loading a plug-in,
 * Max for Live device, or preset, plus clip envelopes and rack macros. Every
 * step of a device call gets the time V8 has left (`expiresInMs`), not a limit
 * of its own.
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

  registerRemoteScriptEnvelopeRoutes();
  registerRemoteScriptDeviceRoutes();
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
    return { available: false };
  }

  return reply.status === 200 ? { available: true } : failedChange(reply);
}

/**
 * Load a resolved browser item in place of the device at a Live path. The
 * remote script refuses when the device there no longer has `deviceName`.
 * @param args - `{ type, path, devicePath, deviceName, expiresInMs }`
 * @returns Whether Live replaced the device, an error worded for the model
 *   (`unfinished` when Live may have started the load anyway), or
 *   `available: false`
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
    return { available: false };
  }

  if (reply.status !== 200) {
    return failedChange(reply);
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

/**
 * POST a change to the remote script. A timeout comes back as the 504 the
 * remote script itself sends: `started` when the request went out, so Live may
 * have made the change.
 * @param request - What to send
 * @param request.route - The remote script's route
 * @param request.body - JSON body
 * @param request.expiresInMs - How long Live may leave the job queued
 * @returns The reply
 */
async function requestChange(request: {
  route: string;
  body: object;
  expiresInMs: number;
}): Promise<RemoteScriptReply> {
  try {
    return await remoteScriptRequest({ method: "POST", ...request });
  } catch (error) {
    if (!(error instanceof RemoteScriptTimeout)) {
      throw error;
    }

    return {
      available: true,
      status: 504,
      body: { error: error.message, ...(error.sent ? { started: true } : {}) },
    };
  }
}

/**
 * The answer for a change the remote script didn't make.
 * @param reply - A reply that wasn't a 200
 * @returns The error, marked `unfinished` when Live may have started the change
 */
function failedChange(reply: RemoteScriptAnswer): {
  available: true;
  error: string;
  unfinished?: true;
} {
  return {
    available: true,
    error: replyError(reply),
    ...(reply.body.started === true ? { unfinished: true as const } : {}),
  };
}
