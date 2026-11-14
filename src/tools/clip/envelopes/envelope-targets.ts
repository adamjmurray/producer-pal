// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Turning an `envelopes` target — a Live parameter id, a mixer name, or a rack
// chain's mixer name like `t0/d0/c1/volume` — into the address the remote
// script takes.

import { errorMessage } from "#src/shared/error-message.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-builders.ts";
import { resolvePathForType } from "#src/tools/shared/validation/id-per-path.ts";
import { mixerParameter } from "#src/tools/clip/read/helpers/clip-envelopes.ts";
import { type EnvelopeLine } from "./envelope-lines.ts";
import { type EnvelopeTrack, isOnTrack, trackText } from "./envelope-track.ts";
import {
  type HostedTarget,
  parseHostedTarget,
  resolveHostedTarget,
} from "./hosted/hosted-envelope-target.ts";

/** A device parameter reachable by the remote script's d0/c1/d0 walk. */
const DEVICE_PARAMETER =
  /^live_set (?:tracks|return_tracks) \d+(?: (?:devices|chains) \d+)+ parameters (\d+)$/;

/** A track mixer parameter, in Live's own spelling. */
const MIXER_PARAMETER =
  /^live_set (?:tracks|return_tracks) \d+ mixer_device (?:(volume|panning)|sends (\d+))$/;

/** A rack chain's own volume, pan or send; group 1 is the chain's Live path. */
const CHAIN_MIXER_PARAMETER =
  /^(live_set (?:tracks|return_tracks) \d+(?: devices \d+ chains \d+)+) mixer_device (?:(volume|panning)|sends (\d+))$/;

/** A rack chain's path, then one of its mixer's names: `t0/d0/c1/volume`. */
export const CHAIN_MIXER_TARGET =
  /^((?:t\d+|rt\d+)(?:\/[^/\s:]+)+)\/(volume|pan|send\d+)$/;

/** Which parameter of which device an envelope route writes. */
export interface EnvelopeTarget {
  /** d0, or d0/c1/d0 into rack chains; d0/c1 for that chain's own mixer; absent for the track's */
  device?: string;
  /** The parameter's index on its device, or volume/pan/send0.. */
  parameter: string | number;
}

/**
 * A line, with the parameter it reaches or why it reaches none. A hosted
 * plug-in's param reaches its slot's parameter only once the line is written,
 * since mapping the slot changes the Set.
 */
export type ResolvedEnvelopeLine =
  | { line: EnvelopeLine; target: EnvelopeTarget }
  | { line: EnvelopeLine; hosted: HostedTarget }
  | { line: EnvelopeLine; error: string };

/**
 * Resolve every line's target against the clip's own track.
 * @param lines - The `envelopes` param, already read into lines
 * @param track - The track the clip sits on
 * @returns Each line with its parameter, or why it has none
 */
export function resolveEnvelopeLines(
  lines: readonly EnvelopeLine[],
  track: EnvelopeTrack,
): ResolvedEnvelopeLine[] {
  return lines.map((line) => {
    try {
      const hosted = parseHostedTarget(line.target);

      return hosted == null
        ? { line, target: envelopeTarget(line.target, track) }
        : { line, hosted: resolveHostedTarget(hosted, track) };
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

    const key =
      "hosted" in entry
        ? `hosted|${entry.hosted.deviceId}|${String(entry.hosted.index)}`
        : `${entry.target.device ?? ""}|${String(entry.target.parameter)}`;
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
 * @param track - The track the clip sits on
 * @returns The address the remote script takes
 * @throws Error when the id names nothing, isn't a parameter, or sits
 *   somewhere clip automation can't reach
 */
function envelopeTarget(target: string, track: EnvelopeTrack): EnvelopeTarget {
  const chainMixer = CHAIN_MIXER_TARGET.exec(target);

  if (chainMixer != null) {
    return trackParameter(
      target,
      chainMixerPath(chainMixer[1] as string, chainMixer[2] as string, track),
    );
  }

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

  if (!isOnTrack(parameter, track)) {
    throw new Error(
      `id ${target} is not on the clip's track (${trackText(track)}), and a clip can only automate its own track`,
    );
  }

  return trackParameter(`id ${target}`, parameter.path);
}

/**
 * Find the mixer parameter a chain target names, on the clip's own track.
 * @param chainPath - The chain's path, as written
 * @param name - volume, pan, or send0..
 * @param track - The track the clip sits on
 * @returns The parameter's Live path
 * @throws Error saying why the target reaches no chain mixer parameter
 */
function chainMixerPath(
  chainPath: string,
  name: string,
  track: EnvelopeTrack,
): string {
  // The shared lookup takes every spelling of a chain: a rack's `c1`, a drum
  // pad's layer `pC1/c0`, a return chain.
  const found = resolvePathForType("chain", chainPath, "envelopes target");

  if (found.id == null) {
    throw new Error(found.reason);
  }

  const chain = LiveAPI.from(found.id);

  if (!isOnTrack(chain, track)) {
    throw new Error(
      `${chainPath} is not on the clip's track (${trackText(track)}), and a clip can only automate its own track`,
    );
  }

  const parameter = mixerParameter(chain, name);

  if (parameter?.exists() !== true) {
    throw new Error(`${chainPath} has no ${name}`);
  }

  return parameter.path;
}

/**
 * Address a parameter already known to sit on the clip's track.
 * @param target - What the error calls the target: `id 472`, or its path
 * @param path - The parameter's Live path
 * @returns The address the remote script takes
 * @throws Error when the parameter is somewhere the remote script can't walk
 */
function trackParameter(target: string, path: string): EnvelopeTarget {
  const mixer = MIXER_PARAMETER.exec(path);

  if (mixer != null) {
    return { parameter: mixerParameterName(mixer[1], mixer[2]) };
  }

  const chainMixer = CHAIN_MIXER_PARAMETER.exec(path);

  if (chainMixer != null) {
    return {
      device: pathOnTrack(chainMixer[1] as string),
      parameter: mixerParameterName(chainMixer[2], chainMixer[3]),
    };
  }

  const device = DEVICE_PARAMETER.exec(path);

  if (device == null) {
    throw new Error(`${target} ${unreachableReason(path)}`);
  }

  return { device: pathOnTrack(path), parameter: Number(device[1]) };
}

/**
 * Spell a device or chain the way the remote script walks to it from the track.
 * @param path - A Live path that already matched one of the patterns above
 * @returns d0, d0/c1/d0, or d0/c1 for a chain
 */
function pathOnTrack(path: string): string {
  // The path matched, so its track prefix did too and it always spells. The
  // first segment is the track, which the request names separately.
  return (extractDevicePath(path) as string).split("/").slice(1).join("/");
}

/**
 * Say why a parameter on the clip's track can't be addressed. The remote
 * script's device walk only spells devices and chains, and a track's or a
 * chain's volume, pan and sends.
 * @param path - The parameter's Live path
 * @returns What's wrong with where it sits, to follow the target
 */
function unreachableReason(path: string): string {
  if (path.includes(" drum_pads ")) {
    return "is inside a drum pad, which clip automation can't reach";
  }

  if (path.includes(" return_chains ")) {
    return "is inside a rack return chain, which clip automation can't reach";
  }

  if (path.includes(" mixer_device ")) {
    return "is a mixer parameter clip automation can't reach: only a track's or a rack chain's volume, pan and sends";
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
