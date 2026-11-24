// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// An `envelopes` target that names a hosted plug-in's param: the wrapper's
// device path plus the param's id, like `t3/d0/h56`.

import {
  hostedParamId,
  detectHostedPlugin,
  NO_PLUGIN_LOADED,
} from "#src/tools/shared/device/helpers/params/hosted-plugin-reading.ts";
import { probePluginHost } from "#src/live-api-adapter/protocols/plugin-host-v8-protocol.ts";
import {
  UNKNOWN_OP,
  wrapperRefusal,
} from "#src/tools/shared/device/helpers/params/hosted-automation-slots.ts";
import { type EnvelopeTrack, isOnTrack, trackText } from "../envelope-track.ts";
import {
  nothingAtPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";

/** Track and device segments, then `h` and the plug-in's number for the param. */
const HOSTED_TARGET = /^((?:t\d+|rt\d+|mt)(?:\/[^/\s:]+)*)\/h(\d+)$/i;

/** What a path here is a part of, for a refusal to name. */
const TARGET_PARAM = "envelopes target";

/** The remote script's device walk: devices and rack chains. */
const WALKABLE_DEVICE = /^d\d+(?:\/(?:c|d)\d+)*$/;

/** A hosted param target, read but not yet looked up. */
export interface ParsedHostedTarget {
  /** The wrapper's device path, as written */
  devicePath: string;
  /** The plug-in's number for the param (the first is 1) */
  index: number;
}

/** A hosted param target on the clip's own track. */
export interface HostedTarget {
  /** The wrapper's device path, by position */
  devicePath: string;
  deviceId: string;
  /** d0, or d0/c1/d0 into rack chains: how the remote script walks to it */
  remotePath: string;
  /** The plug-in's number for the param (the first is 1) */
  index: number;
}

/**
 * Read a target that names a hosted plug-in's param.
 * @param target - An `envelopes` target, as written
 * @returns The device path and param number, or null when it isn't one
 */
export function parseHostedTarget(target: string): ParsedHostedTarget | null {
  const match = HOSTED_TARGET.exec(target);

  return match
    ? { devicePath: match[1] as string, index: Number(match[2]) }
    : null;
}

/**
 * Find the wrapper a hosted target names, on the clip's own track.
 * @param parsed - The target, read
 * @param track - The track the clip sits on
 * @returns The wrapper and the param
 * @throws Error saying why the target reaches no hosted param
 */
export function resolveHostedTarget(
  parsed: ParsedHostedTarget,
  track: EnvelopeTrack,
): HostedTarget {
  if (parsed.index < 1) {
    throw new Error(
      `${hostedParamId(parsed.index)} is not a hosted plug-in's param id (they look like ${hostedParamId(56)})`,
    );
  }

  const resolved = resolvePathToLiveApi(parsed.devicePath, TARGET_PARAM);

  if (resolved.targetType === "drum-pad") {
    throw new Error(
      `${resolved.path} is inside a drum pad, which clip automation can't reach`,
    );
  }

  const device = LiveAPI.from(resolved.liveApiPath);

  if (resolved.namesNothing != null || !device.exists()) {
    throw new Error(
      nothingAtPath(resolved.path, resolved.namesNothing, TARGET_PARAM),
    );
  }

  if (resolved.targetType !== "device") {
    throw new Error(`${resolved.path} is not a device`);
  }

  if (!isOnTrack(device, track)) {
    throw new Error(
      `${resolved.path} is not on the clip's track (${trackText(track)}), and a clip can only automate its own track`,
    );
  }

  // The first segment is the track, which the request names separately.
  const remotePath = resolved.path.split("/").slice(1).join("/");

  if (!WALKABLE_DEVICE.test(remotePath)) {
    throw new Error(
      `${resolved.path} sits somewhere clip automation can't reach`,
    );
  }

  if (detectHostedPlugin(device) == null) {
    throw new Error(`${resolved.path} is not a hosted plug-in`);
  }

  return {
    devicePath: resolved.path,
    deviceId: device.id,
    remotePath,
    index: parsed.index,
  };
}

/** A wrapper with no plug-in to look a name up in: the name falls to its own params. */
export interface HostedLookupFailure {
  /** Why, to tell the caller if the wrapper's own params don't have the name */
  lookupFailed: string;
}

/**
 * Find the hosted param a name target names: a wrapper's path and one of its
 * plug-in's param names, like `t3/d0/Cutoff`.
 * @param named - The target, read as a device path and a name
 * @param named.devicePath - The device's path, as written
 * @param named.name - The param's name
 * @param track - The track the clip sits on
 * @returns The wrapper and the param; null when the device isn't a wrapper or
 *   its plug-in has no param of that name; or why the wrapper has no plug-in
 *   to look the name up in (none loaded, or an outdated wrapper). All leave the
 *   name to Live's own params.
 * @throws Error saying why the name reaches no single hosted param, or why the
 *   lookup failed for any other reason
 */
export function resolveHostedNameTarget(
  named: { devicePath: string; name: string },
  track: EnvelopeTrack,
): HostedTarget | HostedLookupFailure | null {
  const resolved = resolvePathToLiveApi(named.devicePath, TARGET_PARAM);
  const device = LiveAPI.from(resolved.liveApiPath);

  if (
    resolved.namesNothing != null ||
    !device.exists() ||
    detectHostedPlugin(device) == null
  ) {
    return null;
  }

  const reply = probePluginHost(device.id, "lookup", { name: named.name });

  if (reply?.success !== true) {
    const error = reply?.error;
    const refusal = wrapperRefusal(device.id, error, "lookup");

    // Only an answer that says the plug-in can't own the name leaves it to the
    // wrapper's own params. Any other failure might hide a plug-in param of the
    // same name ("Device On"), and writing the wrapper's would hit the wrong one.
    if (error === NO_PLUGIN_LOADED || error?.startsWith(UNKNOWN_OP) === true) {
      return { lookupFailed: refusal };
    }

    throw new Error(refusal);
  }

  const matches = (reply.matches ?? []) as Array<{ index: number }>;

  if (matches.length > 1) {
    const ids = matches.map(({ index }) => hostedParamId(index));

    throw new Error(
      `"${named.name}" names ${ids.length} params on ${resolved.path} (${ids.join(", ")}), so nothing was written. Use one of those ids as the target, like ${resolved.path}/${ids[0]}.`,
    );
  }

  const index = matches[0]?.index;

  return index == null
    ? null
    : resolveHostedTarget({ devicePath: named.devicePath, index }, track);
}
