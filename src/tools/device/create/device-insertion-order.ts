// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noteNameToMidi } from "#src/shared/pitch.ts";
import { VALID_DEVICES } from "#src/tools/constants.ts";
import { navigateRemainingSegments } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { resolveDevicePath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { liveApiAtDevicePath } from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import {
  requireDeviceContainer,
  trackSegmentPath,
  type DeviceContainerPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  formatObjectPath,
  parseObjectPath,
  type DeviceSegment,
  type TrackSegment,
} from "#src/tools/shared/validation/object-path.ts";

/** Where one path entry inserts, and whether it names a slot in that chain. */
interface InsertionTarget {
  /** How the container is spelled back to the caller. */
  display: string;
  /** The input spelling with pad notes resolved, so "pC1" and "pc1" match. */
  key: string;
  /** Live's own path for the container, when it already exists. Two input
   * spellings of one chain differ as text and match here. */
  liveKey: string | null;
  /** Names a slot an insert would push the rest of the chain past. A position
   * Live can't take is an append, which pushes nothing. */
  positioned: boolean;
}

/**
 * Refuse a path list whose later entries are spelled through a chain an earlier
 * entry has renumbered.
 *
 * An insert shifts every later device down a slot, so a `d<n>` written after it
 * — in that chain, or anywhere below it — names something that has already
 * moved. An append renumbers too when Live re-sorts the chain around it, which
 * is every device but an audio effect. Nothing has run yet, so refusing costs
 * the caller only a retry (ADR-0035).
 * @param paths - The path entries, in order
 * @param deviceName - The device every entry inserts
 * @throws Error when an entry is spelled through a renumbered chain
 */
export function validateInsertionOrder(
  paths: string[],
  deviceName: string,
): void {
  // One entry has nothing earlier to have gone stale against, and checking it
  // would read the Live Set for an answer that is already known.
  if (paths.length < 2) {
    return;
  }

  const appendRenumbers = !(
    VALID_DEVICES.audioEffects as readonly string[]
  ).includes(deviceName);
  const renumbered: InsertionTarget[] = [];
  // Devices earlier entries add, per container, so a position is measured
  // against the chain as it will be when this entry runs.
  const pending = new Map<string, number>();
  // A drum rack's chains, once read for this call. A pad-relative path (e.g. a
  // whole kit's worth of "t0/d0/pC1", "t0/d0/pD1", ...) shares one rack, and
  // without this each entry would rescan every chain on it just to find its
  // own.
  const chainsMemo = new Map<string, LiveAPI[]>();

  for (const p of paths) {
    const target = insertionTarget(p, pending, chainsMemo);

    if (target == null) {
      continue;
    }

    const stale = renumbered.find((earlier) => isStale(target, earlier));

    if (stale != null) {
      throw new Error(
        `path entry "${p}" is spelled through "${stale.display}", ` +
          `which an earlier entry renumbers by inserting into it. Make these calls ` +
          `separately, or name where the device should land after that insert.`,
      );
    }

    if (target.liveKey != null) {
      pending.set(target.liveKey, (pending.get(target.liveKey) ?? 0) + 1);
    }

    if (target.positioned || appendRenumbers) {
      renumbered.push(target);
    }
  }
}

// --- Helpers below main exports ---

/**
 * Whether a later entry is spelled through a container an earlier one
 * renumbers. Compare by the object both resolved to when both exist — Live's
 * path is the same for every spelling of one chain, where the input spellings
 * are not. Otherwise compare the input spellings, which is all there is when
 * the container has yet to be created.
 * @param target - The entry being checked
 * @param earlier - An entry ahead of it that renumbers what it inserts into
 * @returns True when the target names a slot the earlier entry moves
 */
function isStale(target: InsertionTarget, earlier: InsertionTarget): boolean {
  const [key, earlierKey, separator] =
    target.liveKey != null && earlier.liveKey != null
      ? [target.liveKey, earlier.liveKey, " "]
      : [target.key, earlier.key, "/"];

  return (
    key.startsWith(`${earlierKey}${separator}`) ||
    (target.positioned && key === earlierKey)
  );
}

/**
 * The chain a path inserts into, and whether it names a position in it. A path
 * that doesn't parse has no target — the insert loop reports it, one entry at a
 * time, the way it always has.
 * @param path - One path entry
 * @param pending - Devices earlier entries add, keyed by container
 * @param chainsMemo - A drum rack's chains, once read for this call
 * @returns The container and whether the insert is positioned, or null
 */
function insertionTarget(
  path: string,
  pending: Map<string, number>,
  chainsMemo: Map<string, LiveAPI[]>,
): InsertionTarget | null {
  let parsed: DeviceContainerPath;

  try {
    parsed = requireDeviceContainer(parseObjectPath(path, "path"), "path");
  } catch {
    return null;
  }

  const last = parsed.segments.at(-1);
  const position = last?.kind === "device" ? last.index : null;
  const segments =
    position == null ? parsed.segments : parsed.segments.slice(0, -1);
  const container = { kind: "device", root: parsed.root, segments } as const;
  const live = peekContainer(parsed.root, segments, chainsMemo);

  return {
    display: formatObjectPath(container),
    key: formatObjectPath({ ...container, segments: segments.map(padByNote) }),
    liveKey: live?.path ?? null,
    positioned: position != null && !landsAtEnd(position, live, pending),
  };
}

/**
 * The container a path names, but only when it is already there. Nothing has
 * run yet, so this must not create the chains the real resolution auto-creates
 * on its way down — a container that doesn't exist reads as unknown instead.
 * @param root - Parsed track root
 * @param segments - The container's segments below the root
 * @param chainsMemo - A drum rack's chains, once read for this call
 * @returns The container, or null when any step of the path is missing
 */
function peekContainer(
  root: TrackSegment,
  segments: DeviceSegment[],
  chainsMemo: Map<string, LiveAPI[]>,
): LiveAPI | null {
  if (segments.length === 0) {
    return existing(liveApiAtDevicePath(trackSegmentPath(root).toString()));
  }

  const resolved = resolveDevicePath({ kind: "device", root, segments });

  if (resolved.targetType !== "drum-pad") {
    return existing(liveApiAtDevicePath(resolved.liveApiPath));
  }

  const rack = liveApiAtDevicePath(resolved.liveApiPath);

  if (!rack.exists()) {
    return null;
  }

  // Live indexes drum pads by note, so the tail only resolves against the
  // rack's own chains, read once per rack rather than once per pad.
  return existing(
    drumPadChain(
      rack,
      resolved.drumPadNote as string,
      resolved.remainingSegments,
      chainsMemo,
    ),
  );
}

/**
 * Every chain on a rack, read once per call and reused for every pad on it.
 * @param rack - The drum rack device
 * @param chainsMemo - Chains already read for this call, keyed by rack path
 * @returns The rack's chains, in rack order
 */
function chainsOfRack(
  rack: LiveAPI,
  chainsMemo: Map<string, LiveAPI[]>,
): LiveAPI[] {
  const cached = chainsMemo.get(rack.path);

  if (cached != null) {
    return cached;
  }

  const chains = rack.getChildren("chains");

  chainsMemo.set(rack.path, chains);

  return chains;
}

/**
 * The chain a drum-pad path names, resolved against the rack's chain list
 * built once per rack for this call rather than rescanned per pad.
 * @param rack - The drum rack device
 * @param drumPadNote - Note name (e.g. "C1"), or "*" for the catch-all
 * @param remainingSegments - Path segments after the pad (c/d prefixed)
 * @param chainsMemo - A drum rack's chains, once read for this call
 * @returns The resolved target, or null when the path names nothing
 */
function drumPadChain(
  rack: LiveAPI,
  drumPadNote: string,
  remainingSegments: string[],
  chainsMemo: Map<string, LiveAPI[]>,
): LiveAPI | null {
  const inNote = drumPadNote === "*" ? -1 : noteNameToMidi(drumPadNote);

  if (inNote == null) {
    return null;
  }

  let chainIndex = 0;
  let rest = remainingSegments;
  const first = remainingSegments[0];

  if (first?.startsWith("c")) {
    chainIndex = Number.parseInt(first.slice(1));

    if (Number.isNaN(chainIndex)) {
      return null;
    }

    rest = remainingSegments.slice(1);
  }

  const matching = chainsOfRack(rack, chainsMemo).filter(
    (chain) => chain.getProperty("in_note") === inNote,
  );
  const chain = matching[chainIndex];

  if (chain == null) {
    return null;
  }

  // Only the chain's own identity matters for order validation; anything
  // after it (a device, a nested rack's own pad) reuses the same read-only
  // navigator the rest of path resolution does.
  return rest.length === 0
    ? chain
    : navigateRemainingSegments(chain, rest).target;
}

/**
 * An object, or null when nothing is there.
 * @param object - A resolved object, or null
 * @returns The object when it exists
 */
function existing(object: LiveAPI | null): LiveAPI | null {
  return object != null && object.exists() ? object : null;
}

/**
 * Whether a named position is really an append. Live refuses a position past
 * the end of a chain, including 0 on an empty one, so the insert drops the
 * position and appends — and an append moves nothing that was already there.
 * Unknown containers keep the position, which is all a parse can say.
 * @param position - The position the path named
 * @param container - The container, when it already exists
 * @param pending - Devices earlier entries add, keyed by container
 * @returns True when the insert lands on the end rather than in the chain
 */
function landsAtEnd(
  position: number,
  container: LiveAPI | null,
  pending: Map<string, number>,
): boolean {
  if (container == null) {
    return false;
  }

  const deviceCount =
    container.getChildCount("devices") + (pending.get(container.path) ?? 0);

  return position > deviceCount || (position === 0 && deviceCount === 0);
}

/**
 * Spell a drum pad by its MIDI note, so two spellings of one pad compare equal.
 * Note names are case-insensitive and enharmonic, so "pC1", "pc1" and "pB#0"
 * all name the same pad and only the number says so.
 * @param segment - One parsed device-path segment
 * @returns The segment, with a pad's note replaced by its MIDI number
 */
function padByNote(segment: DeviceSegment): DeviceSegment {
  if (segment.kind !== "drum-pad") {
    return segment;
  }

  const midi = noteNameToMidi(segment.note);

  return midi == null ? segment : { ...segment, note: String(midi) };
}
