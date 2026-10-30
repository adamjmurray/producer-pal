// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// An `envelopes` target that names a hosted plug-in's param: the wrapper's
// device path plus the param's id, like `t3/d0/h56`.

import {
  hostedParamId,
  detectHostedPlugin,
} from "#src/tools/shared/device/helpers/params/hosted-plugin-reading.ts";
import {
  nothingAtPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";

/** Track and device segments, then `h` and the plug-in's number for the param. */
const HOSTED_TARGET = /^((?:t\d+|rt\d+|mt)(?:\/[^/\s:]+)*)\/h(\d+)$/i;

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
 * Read a target that names a hosted plug-in's param. Only builds with hosted
 * plug-ins on know the spelling.
 * @param target - An `envelopes` target, as written
 * @returns The device path and param number, or null when it isn't one
 */
export function parseHostedTarget(target: string): ParsedHostedTarget | null {
  if (process.env.ENABLE_HOSTED_PLUGINS !== "true") {
    return null;
  }

  const match = HOSTED_TARGET.exec(target);

  return match
    ? { devicePath: match[1] as string, index: Number(match[2]) }
    : null;
}

/**
 * Find the wrapper a hosted target names, on the clip's own track.
 * @param parsed - The target, read
 * @param trackIndex - The track the clip sits on
 * @returns The wrapper and the param
 * @throws Error saying why the target reaches no hosted param
 */
export function resolveHostedTarget(
  parsed: ParsedHostedTarget,
  trackIndex: number,
): HostedTarget {
  if (parsed.index < 1) {
    throw new Error(
      `${hostedParamId(parsed.index)} is not a hosted plug-in's param id (they look like ${hostedParamId(56)})`,
    );
  }

  const resolved = resolvePathToLiveApi(parsed.devicePath, "envelopes target");

  if (resolved.targetType === "drum-pad") {
    throw new Error(
      `${resolved.path} is inside a drum pad, which clip automation can't reach`,
    );
  }

  const device = LiveAPI.from(resolved.liveApiPath);

  if (resolved.namesNothing != null || !device.exists()) {
    throw new Error(
      nothingAtPath(resolved.path, resolved.namesNothing, "envelopes target"),
    );
  }

  if (resolved.targetType !== "device") {
    throw new Error(`${resolved.path} is not a device`);
  }

  if (device.category !== "regular" || device.trackIndex !== trackIndex) {
    throw new Error(
      `${resolved.path} is not on the clip's track (t${String(trackIndex)}), and a clip can only automate its own track`,
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
