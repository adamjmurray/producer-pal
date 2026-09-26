// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Turning an `envelopes` target — a Live parameter id, or a mixer name — into
// the address the remote script takes.

import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-builders.ts";

/** A device parameter reachable by the remote script's d0/c1/d0 walk. */
const DEVICE_PARAMETER =
  /^live_set tracks \d+(?: (?:devices|chains) \d+)+ parameters (\d+)$/;

/** A track mixer parameter, in Live's own spelling. */
const MIXER_PARAMETER =
  /^live_set tracks \d+ mixer_device (?:(volume|panning)|sends (\d+))$/;

/** Which parameter of which device an envelope route writes. */
export interface EnvelopeTarget {
  /** d0, or d0/c1/d0 into rack chains; absent for a mixer parameter */
  device?: string;
  /** The parameter's index on its device, or volume/pan/send0.. */
  parameter: string | number;
}

/**
 * Resolve one `envelopes` target against the clip's own track.
 * @param target - The target as the call wrote it: an id, or volume/pan/send0..
 * @param trackIndex - The track the clip sits on
 * @returns The address the remote script takes
 * @throws Error when the id names nothing, isn't a parameter, or sits
 *   somewhere clip automation can't reach
 */
export function envelopeTarget(
  target: string,
  trackIndex: number,
): EnvelopeTarget {
  if (!/^\d+$/.test(target)) {
    // A mixer name is already the remote script's own spelling.
    return { parameter: target };
  }

  const parameter = LiveAPI.from(target);

  if (!parameter.exists()) {
    throw new Error(`no Live object with id ${target}`);
  }

  if (parameter.type !== "DeviceParameter") {
    throw new Error(`id ${target} is a ${parameter.type}, not a parameter`);
  }

  if (parameter.category !== "regular" || parameter.trackIndex !== trackIndex) {
    throw new Error(
      `id ${target} is not on the clip's track (t${String(trackIndex)}), and a clip can only automate its own track`,
    );
  }

  return trackParameter(target, parameter.path);
}

// --- Helpers below main exports ---

/**
 * Address a parameter already known to sit on the clip's track.
 * @param target - The target as the call wrote it, for the error
 * @param path - The parameter's Live path
 * @returns The address the remote script takes
 * @throws Error when the parameter is somewhere the remote script can't walk
 */
function trackParameter(target: string, path: string): EnvelopeTarget {
  const mixer = MIXER_PARAMETER.exec(path);

  if (mixer != null) {
    return { parameter: mixerParameterName(mixer[1], mixer[2]) };
  }

  const device = DEVICE_PARAMETER.exec(path);

  if (device == null) {
    // Drum pads and a rack's return chains take path segments the remote
    // script's device walk has no spelling for.
    throw new Error(
      `id ${target} is inside a drum pad or a rack return chain, which clip automation can't reach`,
    );
  }

  // The path matched, so its track prefix did too and it always spells.
  const devicePath = extractDevicePath(path) as string;

  return {
    // The first segment is the track, which the request names separately.
    device: devicePath.split("/").slice(1).join("/"),
    parameter: Number(device[1]),
  };
}

/**
 * Name a mixer parameter the way the remote script does.
 * @param named - "volume" or "panning", when the path spelled one
 * @param sendIndex - The send's index, when the path spelled a send instead
 * @returns volume, pan, or send0..
 */
function mixerParameterName(
  named: string | undefined,
  sendIndex: string | undefined,
): string {
  if (named === "volume") {
    return "volume";
  }

  return named === "panning" ? "pan" : `send${String(sendIndex)}`;
}
