// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Turning an `envelopes` target — a Live parameter id, or a mixer name — into
// the address the remote script takes.

import { errorMessage } from "#src/shared/error-message.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-builders.ts";
import { type EnvelopeLine } from "./envelope-lines.ts";

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

/** A line, with the parameter it reaches or why it reaches none. */
export type ResolvedEnvelopeLine =
  | { line: EnvelopeLine; target: EnvelopeTarget }
  | { line: EnvelopeLine; error: string };

/**
 * Resolve every line's target against the clip's own track.
 * @param lines - The `envelopes` param, already read into lines
 * @param trackIndex - The track the clip sits on
 * @returns Each line with its parameter, or why it has none
 */
export function resolveEnvelopeLines(
  lines: readonly EnvelopeLine[],
  trackIndex: number,
): ResolvedEnvelopeLine[] {
  return lines.map((line) => {
    try {
      return { line, target: envelopeTarget(line.target, trackIndex) };
    } catch (error) {
      return { line, error: errorMessage(error) };
    }
  });
}

/**
 * Find two lines that reach one parameter by different spellings, like `volume`
 * and the track volume's id. Lines that name the same text are refused earlier.
 * @param resolved - The lines, resolved against the clip's track
 * @returns The first two lines that share a parameter, if any
 */
export function findSameParameter(
  resolved: readonly ResolvedEnvelopeLine[],
): [EnvelopeLine, EnvelopeLine] | undefined {
  const seen = new Map<string, EnvelopeLine>();

  for (const entry of resolved) {
    if ("error" in entry) {
      continue;
    }

    const key = `${entry.target.device ?? ""}|${String(entry.target.parameter)}`;
    const first = seen.get(key);

    if (first != null) {
      return [first, entry.line];
    }

    seen.set(key, entry.line);
  }

  return undefined;
}

// --- Helpers below main exports ---

/**
 * Resolve one `envelopes` target against the clip's own track.
 * @param target - The target as the call wrote it: an id, or volume/pan/send0..
 * @param trackIndex - The track the clip sits on
 * @returns The address the remote script takes
 * @throws Error when the id names nothing, isn't a parameter, or sits
 *   somewhere clip automation can't reach
 */
function envelopeTarget(target: string, trackIndex: number): EnvelopeTarget {
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
    throw new Error(`id ${target} ${unreachableReason(path)}`);
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
 * Say why a parameter on the clip's track can't be addressed. The remote
 * script's device walk only spells devices and chains, and the track's volume,
 * pan and sends.
 * @param path - The parameter's Live path
 * @returns What's wrong with where it sits, to follow "id N"
 */
function unreachableReason(path: string): string {
  if (path.includes(" drum_pads ")) {
    return "is inside a drum pad, which clip automation can't reach";
  }

  if (path.includes(" return_chains ")) {
    return "is inside a rack return chain, which clip automation can't reach";
  }

  if (path.includes(" mixer_device ")) {
    return path.includes(" chains ")
      ? "is a rack chain's own mixer parameter, which clip automation can't reach"
      : "is a mixer parameter clip automation can't reach: only the track's volume, pan and sends";
  }

  return "is a parameter clip automation can't reach";
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
