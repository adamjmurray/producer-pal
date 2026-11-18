// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// An `envelopes` target that names a device param by its device's path and the
// param's name, like `t0/d0/Filter Freq` or `t0/d1/c0/d0/Dry/Wet`.

import {
  ambiguousNameReason,
  resolveParamsByName,
} from "#src/tools/device/update/helpers/params/param-name-resolution.ts";
import {
  nothingAtPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { type EnvelopeTrack, isOnTrack, trackText } from "../envelope-track.ts";

const TRACK_SEGMENT = /^(?:t|rt)\d+$/;

/** A step of the remote script's device walk: a device or a rack chain. */
const WALK_SEGMENT = /^[cd]\d+$/;

/** A longer path that ends on a mixer name spells a chain's mixer: `t0/d0/rc0/pan`. */
const CHAIN_MIXER_TAIL = /\/(?:volume|pan|send\d+)$/;

/** A name target, read but not yet looked up. */
export interface ParsedNameTarget {
  /** The device's path, as written */
  devicePath: string;
  /** The param's name, which may itself contain "/" */
  name: string;
}

/**
 * Read a target that names a param by device path and name. The leading
 * `dN`/`cN` segments are the path and the rest is the name, since names like
 * "Dry/Wet" contain a slash. A path that ends on a chain's mixer name
 * (`t0/d0/c1/volume`, `t0/d0/rc0/pan`) is not one.
 * @param target - An `envelopes` target, as written
 * @returns The device path and param name, or null when it isn't one
 */
export function parseNameTarget(target: string): ParsedNameTarget | null {
  const segments = target.split("/");

  if (!TRACK_SEGMENT.test(segments[0] as string)) {
    return null;
  }

  let end = 1;

  while (end < segments.length && WALK_SEGMENT.test(segments[end] as string)) {
    end += 1;
  }

  const name = segments.slice(end).join("/").trim();

  if (
    end === 1 ||
    !(segments[end - 1] as string).startsWith("d") ||
    !name ||
    CHAIN_MIXER_TAIL.test(name)
  ) {
    return null;
  }

  return { devicePath: segments.slice(0, end).join("/"), name };
}

/**
 * Find the param a name target names, on the clip's own track.
 * @param parsed - The target, read
 * @param track - The track the clip sits on
 * @returns The parameter
 * @throws Error saying why the target reaches no single param
 */
export function resolveNameTarget(
  parsed: ParsedNameTarget,
  track: EnvelopeTrack,
): LiveAPI {
  const resolved = resolvePathToLiveApi(parsed.devicePath, "envelopes target");
  const device = LiveAPI.from(resolved.liveApiPath);

  if (resolved.namesNothing != null || !device.exists()) {
    throw new Error(
      nothingAtPath(resolved.path, resolved.namesNothing, "envelopes target"),
    );
  }

  if (!isOnTrack(device, track)) {
    throw new Error(
      `${resolved.path} is not on the clip's track (${trackText(track)}), and a clip can only automate its own track`,
    );
  }

  const matches = resolveParamsByName(device, parsed.name);
  const ambiguous = ambiguousNameReason(
    matches,
    device,
    "Use one of those ids as the target.",
  );

  if (ambiguous != null) {
    throw new Error(`"${parsed.name}" ${ambiguous}`);
  }

  const param = matches[0];

  if (param == null) {
    // A name with a slash may be a path the walk can't follow (a drum pad).
    const hint = parsed.name.includes("/")
      ? " (a device path here takes only dN and cN segments)"
      : "";

    throw new Error(
      `${resolved.path} has no param named "${parsed.name}"${hint}`,
    );
  }

  return param;
}
