// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { DEVICE_CONVERSION_ROUTES } from "#src/tools/shared/remote-script/device-conversions/device-conversions-contract.ts";
import { DEVICE_BASICS_ROUTE } from "#src/tools/shared/remote-script/device-basics/device-basics-contract.ts";
import {
  RACK_MACROS_ROUTE,
  REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
} from "#src/tools/shared/remote-script/rack-macros-contract.ts";
import { type RouteReply } from "#src/tools/shared/remote-script/remote-script-route-contract.ts";
import { SIMPLER_SETTINGS_ROUTES } from "#src/tools/shared/remote-script/simpler-settings/simpler-settings-contract.ts";
import { registerNodeRoute } from "../../node-request-protocol.ts";
import { requireString } from "../../route-string-args.ts";
import { requireExpiry } from "./remote-script-change.ts";
import { forwardRemoteScriptRequest } from "./remote-script-forward.ts";

/**
 * Register the routes V8 uses to ask the remote script which rack macros are
 * mapped (`/device/macros`), for a device's name and on/off state
 * (`/device/basics`), to read and write a Simpler's pitch bend ranges and to
 * turn its slices into a Drum Rack (`/device/simpler/*`), and for the two
 * conversions between a track's devices and a drum pad.
 */
export function registerRemoteScriptDeviceRoutes(): void {
  registerNodeRoute(
    RACK_MACROS_ROUTE,
    forwardRackMacrosRequest,
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );
  registerNodeRoute(
    DEVICE_BASICS_ROUTE,
    forwardDeviceBasicsRequest,
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );
  registerNodeRoute(
    SIMPLER_SETTINGS_ROUTES.read,
    forwardSimplerReadRequest,
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );
  registerNodeRoute(
    SIMPLER_SETTINGS_ROUTES.write,
    forwardSimplerWriteRequest,
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );
  registerNodeRoute(
    SIMPLER_SETTINGS_ROUTES.toDrumRack,
    forwardSimplerToDrumRackRequest,
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );
  registerNodeRoute(
    DEVICE_CONVERSION_ROUTES.trackToDrumRack,
    forwardTrackToDrumRackRequest,
    REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
  );
  registerNodeRoute(
    DEVICE_CONVERSION_ROUTES.drumPadToTrack,
    forwardDrumPadToTrackRequest,
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
  return await forwardRemoteScriptRequest("/device/macros", {
    device_paths: devicePathsOf(args),
  });
}

/**
 * Forward one device name and on/off state request to the remote script.
 * @param args - `{ devicePaths }`, in V8's spelling
 * @returns The remote script's JSON, an error worded for the model, or
 *   `available: false` when nothing answered
 * @throws Error when `devicePaths` isn't a list of strings, or the remote
 *   script took the request but never answered
 */
async function forwardDeviceBasicsRequest(
  args: unknown,
): Promise<RouteReply<Record<string, unknown>>> {
  return await forwardRemoteScriptRequest("/device/basics", {
    device_paths: devicePathsOf(args),
  });
}

/**
 * Forward one Simpler settings read to the remote script.
 * @param args - `{ devicePaths }`, in V8's spelling
 * @returns The remote script's JSON, an error worded for the model, or
 *   `available: false` when nothing answered
 * @throws Error when `devicePaths` isn't a list of strings, or the remote
 *   script took the request but never answered
 */
async function forwardSimplerReadRequest(
  args: unknown,
): Promise<RouteReply<Record<string, unknown>>> {
  return await forwardRemoteScriptRequest("/device/simpler/read", {
    device_paths: devicePathsOf(args),
  });
}

/**
 * Forward one Simpler settings write to the remote script.
 * @param args - `{ devicePath, pitchBendRange?, notePitchBendRange? }`, in V8's
 *   spelling
 * @returns The remote script's JSON, an error worded for the model, or
 *   `available: false` when nothing answered
 * @throws Error when `devicePath` isn't a string, `expiresInMs` is missing, or
 *   the remote script took the request but never answered
 */
async function forwardSimplerWriteRequest(
  args: unknown,
): Promise<RouteReply<Record<string, unknown>>> {
  const { pitchBendRange, notePitchBendRange } = args as Record<
    string,
    unknown
  >;

  return await forwardRemoteScriptRequest(
    "/device/simpler/write",
    {
      device_path: requireString(args, "devicePath"),
      ...(pitchBendRange != null && { pitch_bend_range: pitchBendRange }),
      ...(notePitchBendRange != null && {
        note_pitch_bend_range: notePitchBendRange,
      }),
    },
    requireExpiry(args),
  );
}

/**
 * Forward one slices-to-Drum-Rack conversion to the remote script.
 * @param args - `{ devicePath }`, in V8's spelling
 * @returns The remote script's JSON, an error worded for the model, or
 *   `available: false` when nothing answered
 * @throws Error when `devicePath` isn't a string, `expiresInMs` is missing, or
 *   the remote script took the request but never answered
 */
async function forwardSimplerToDrumRackRequest(
  args: unknown,
): Promise<RouteReply<Record<string, unknown>>> {
  return await forwardRemoteScriptRequest(
    "/device/simpler/to-drum-rack",
    { device_path: requireString(args, "devicePath") },
    requireExpiry(args),
  );
}

/**
 * Forward one track-devices-to-Drum-Rack conversion to the remote script.
 * @param args - `{ track }`: t0, t1...
 * @returns The remote script's JSON, an error worded for the model, or
 *   `available: false` when nothing answered
 * @throws Error when `track` isn't a string, `expiresInMs` is missing, or the
 *   remote script took the request but never answered
 */
async function forwardTrackToDrumRackRequest(
  args: unknown,
): Promise<RouteReply<Record<string, unknown>>> {
  return await forwardRemoteScriptRequest(
    "/track/to-drum-rack",
    { track: requireString(args, "track") },
    requireExpiry(args),
  );
}

/**
 * Forward one drum-pad-to-track conversion to the remote script.
 * @param args - `{ devicePath, note }`, in V8's spelling
 * @returns The remote script's JSON, an error worded for the model, or
 *   `available: false` when nothing answered
 * @throws Error when `devicePath` isn't a string, `expiresInMs` is missing, or
 *   the remote script took the request but never answered
 */
async function forwardDrumPadToTrackRequest(
  args: unknown,
): Promise<RouteReply<Record<string, unknown>>> {
  return await forwardRemoteScriptRequest(
    "/device/drum-pad/to-track",
    {
      device_path: requireString(args, "devicePath"),
      note: (args as Record<string, unknown>).note,
    },
    requireExpiry(args),
  );
}

/**
 * The paths a batch route was asked about.
 * @param args - The route args
 * @returns `devicePaths`
 * @throws Error when it isn't a list of strings
 */
function devicePathsOf(args: unknown): string[] {
  const paths = (args as Record<string, unknown> | null)?.devicePaths;

  if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) {
    throw new TypeError("devicePaths must be a list of strings");
  }

  return paths;
}
