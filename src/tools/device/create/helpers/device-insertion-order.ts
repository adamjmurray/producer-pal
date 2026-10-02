// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noteNameToMidi } from "#src/shared/pitch.ts";
import { appendRenumbers } from "#src/tools/device/create/helpers/device-creation.ts";
import { navigateRemainingSegments } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { resolveDevicePath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { resolveDeviceTypeSegments } from "#src/tools/shared/device/helpers/path/device-type-segments.ts";
import { liveApiAtDevicePath } from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import {
  requireDeviceContainer,
  trackSegmentPath,
  type DeviceContainerPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  formatObjectPath,
  parseObjectPath,
  type CanonicalDeviceSegment,
  type DeviceSegment,
  type TrackSegment,
} from "#src/tools/shared/validation/object-path.ts";

/** Where one path entry inserts, and whether it names a slot in that chain. */
interface InsertionTarget {
  /** How the container is spelled back to the caller. */
  display: string;
  /** The input spelling with pad notes resolved, so "pC1" and "pc1" match. */
  key: string;
  /** Live's own path, when the container exists: two input spellings of one
   * chain differ as text and match here. */
  liveKey: string | null;
  /** Names a slot an insert pushes the rest of the chain past. A position Live
   * can't take is an append, which pushes nothing. */
  positioned: boolean;
  /** Inserts into a chain it appends (`c+`), which nothing else in the call
   * can name — so it renumbers nothing. */
  appendsChain: boolean;
}

/** One entry of the path list, and the device it inserts. */
export interface InsertionEntry {
  path: string;
  device: string;
}

/**
 * Refuse a path list whose later entries are spelled through a chain an earlier
 * entry has renumbered. An insert shifts every later device down a slot, so a
 * `d<n>` written after it — in that chain or below it — names something that
 * has already moved. An append renumbers too when Live re-sorts the chain
 * around it, which is every device but an audio effect (ADR-0035).
 * @param entries - The path entries and the device each one inserts, in order
 * @throws Error when an entry is spelled through a renumbered chain
 */
export function validateInsertionOrder(entries: InsertionEntry[]): void {
  // One entry has nothing earlier to have gone stale against, and checking it
  // would read the Live Set for an answer that is already known.
  if (entries.length < 2) {
    return;
  }

  const renumbered: InsertionTarget[] = [];
  // Devices earlier entries add, per container, so a position is measured
  // against the chain as it will be when this entry runs.
  const pending = new Map<string, number>();
  // A drum rack's chains, once read for this call. A pad-relative path (e.g. a
  // whole kit's worth of "t0/d0/pC1", "t0/d0/pD1", ...) shares one rack, and
  // without this each entry would rescan every chain on it just to find its
  // own.
  const chainsMemo = new Map<string, LiveAPI[]>();

  for (const { path: p, device } of entries) {
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

    // A `c+` entry's device goes into a chain that doesn't exist yet, so it
    // neither fills nor renumbers the container its path is spelled through.
    if (target.appendsChain) {
      continue;
    }

    if (target.liveKey != null) {
      pending.set(target.liveKey, (pending.get(target.liveKey) ?? 0) + 1);
    }

    if (target.positioned || appendRenumbers(device)) {
      renumbered.push(target);
    }
  }
}

// --- Helpers below main exports ---

/**
 * Whether a later entry is spelled through a container an earlier one
 * renumbers. Compare by the object both resolved to when both exist — one chain
 * has one Live path but many spellings — and by spelling before it exists.
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

  // A type-addressed segment has to become a position before one is read off
  // it. One that names nothing has no target to check the order against.
  const { segments: canonical, namesNothing } = resolveDeviceTypeSegments(
    parsed.root,
    parsed.segments,
  );

  if (namesNothing != null) {
    return null;
  }

  const last = canonical.at(-1);
  // A `c+` ends in the rack it appends to, not in a position inside it.
  const position =
    !parsed.appendsChain && last?.kind === "device" ? last.index : null;
  const segments = position == null ? canonical : canonical.slice(0, -1);
  const container = { kind: "device", root: parsed.root, segments } as const;
  const live = peekContainer(parsed.root, segments, chainsMemo);

  return {
    display: formatObjectPath(container),
    key: formatObjectPath({ ...container, segments: segments.map(padByNote) }),
    liveKey: live?.path ?? null,
    positioned: position != null && !landsAtEnd(position, live, pending),
    appendsChain: parsed.appendsChain ?? false,
  };
}

/**
 * The container a path names, but only when it is already there: nothing has
 * run yet, so this must not auto-create chains on the way down.
 * @param root - Parsed track root
 * @param segments - The container's segments below the root
 * @param chainsMemo - A drum rack's chains, once read for this call
 * @returns The container, or null when any step of the path is missing
 */
function peekContainer(
  root: TrackSegment,
  segments: CanonicalDeviceSegment[],
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
 * The chain a drum-pad path names, against the rack's chain list built once
 * per rack for this call rather than rescanned per pad.
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
  // The grammar validated the note, so this always converts; the catch-all is
  // in_note -1. Every segment here was formatted from a parsed one, so a "c"
  // segment is always "c<index>".
  const inNote =
    drumPadNote === "*" ? -1 : (noteNameToMidi(drumPadNote) as number);

  let chainIndex = 0;
  let rest = remainingSegments;
  const first = remainingSegments[0];

  if (first?.startsWith("c")) {
    chainIndex = Number.parseInt(first.slice(1));
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
 * the end of a chain, including 0 on an empty one, so the insert drops it and
 * appends, moving nothing. An unknown container keeps its position.
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
 * Spell a drum pad by its MIDI note, so two spellings of one pad compare equal:
 * note names are case-insensitive and enharmonic, so "pC1", "pc1" and "pB#0"
 * all name one pad and only the number says so.
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
