// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// One rule for every tool that places devices from a path list (create, move,
// copy): each entry runs in turn, but the call wrote every path against the
// chains as they were, so a later entry spelled through a chain an earlier
// one changed is refused before anything is made or moved.

import { noteNameToMidi } from "#src/shared/pitch.ts";
import { navigateRemainingSegments } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-builders.ts";
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

/** A chain an entry inserts into or takes from. */
interface InsertionTarget {
  /** How the container is spelled back to the caller. */
  display: string;
  /** The input spelling with pad notes resolved, so "pC1" and "pc1" match. A
   * bare pad is spelled as its first layer (`pC1/c0`), where a device lands. */
  key: string;
  /** The pad itself, when the container is one: what a pad move renumbers. */
  padKey: string | null;
  /** Live's own path, when the container exists: two input spellings of one
   * chain differ as text and match here. */
  liveKey: string | null;
  /** Names a track, device or return chain that isn't there, so the move or
   * copy fails on its own turn. A missing chain doesn't count: one is made. */
  reachesNothing: boolean;
  /** Names a slot an insert pushes the rest of the chain past. Position 0 of an
   * empty chain is an append, which pushes nothing. */
  positioned: boolean;
  /** Names a slot past the end of the chain, so the insert is refused and
   * adds nothing. */
  pastTheEnd: boolean;
  /** Inserts into a chain it appends (`c+`), which nothing else in the call
   * can name — so it renumbers nothing. */
  appendsChain: boolean;
}

/** A chain an earlier entry changed, and which entry. */
interface Renumbered extends InsertionTarget {
  by: string;
}

/** One entry of a path list: where it puts something, and what it takes. */
export interface InsertionEntry {
  /** Where the device (or a pad move's chains) goes */
  path: string;
  /** Whether appending it renumbers the chain: Live re-sorts every device but
   * an audio effect into place */
  appendRenumbers: boolean;
  /** On a move, what leaves its place first: the device's own Live path, or
   * the pad path a drum chain leaves */
  from?: { device: string } | { pad: string };
  /** How the call named what moves, for the refusal */
  named?: string;
}

/** How a tool's entries are named in a refusal. */
export interface InsertionWords {
  /** The param the entries came from */
  param: "path" | "toPath";
  /** What an entry does to its destination. A move or copy to nowhere skips
   * on its own, so it changes nothing. */
  verb: "insert at" | "move to" | "copy to";
}

/**
 * Refuse a path list whose later entries are spelled through a chain an earlier
 * entry has renumbered. An insert shifts every later device down a slot, and a
 * device moved out shifts them up, so a `d<n>` written after it — in that
 * chain or below it — names something that has already moved. An append
 * renumbers too when Live re-sorts the chain around it, which is every device
 * but an audio effect. A drum chain moved to another pad renumbers the layers
 * of both pads.
 * @param entries - The path entries, in order
 * @param words - How the tool's entries are named in the refusal; a create
 *   call's `path` by default
 * @throws Error when an entry is spelled through a renumbered chain
 */
export function validateInsertionOrder(
  entries: InsertionEntry[],
  words?: InsertionWords,
): void {
  // One entry has nothing earlier to have gone stale against, and checking it
  // would read the Live Set for an answer that is already known.
  if (entries.length < 2) {
    return;
  }

  const renumbered: Renumbered[] = [];
  // Devices earlier entries add, per container, so a position is measured
  // against the chain as it will be when this entry runs.
  const pending = new Map<string, number>();
  // A drum rack's chains, once read for this call. A pad-relative path (e.g. a
  // whole kit's worth of "t0/d0/pC1", "t0/d0/pD1", ...) shares one rack, and
  // without this each entry would rescan every chain on it just to find its
  // own.
  const chainsMemo = new Map<string, LiveAPI[]>();

  for (const entry of entries) {
    const { path: p, from } = entry;
    const target = insertionTarget(p, pending, chainsMemo);

    // Names nowhere, or a slot past the end: refused on its own turn, so it
    // fills, takes and moves nothing.
    if (target == null || changesNothing(target, words)) {
      continue;
    }

    const stale = renumbered.find((earlier) => isStale(target, earlier));

    if (stale != null) {
      throw new Error(
        `${words?.param ?? "path"} entry "${p}" is spelled through ` +
          `"${stale.display}", which ${stale.by} renumbers. Make these calls ` +
          `separately.`,
      );
    }

    const by = `the ${words?.verb ?? "insert at"} "${p}"`;
    const left =
      from == null ? null : leaving(from, pending, chainsMemo, entry.named);

    if (left != null) {
      renumbered.push(left);
    }

    // A pad move re-maps chains onto the destination pad.
    if (from != null && "pad" in from) {
      renumbered.push(padChanged(target, by));
      continue;
    }

    // A `c+` entry's device goes into a chain that doesn't exist yet, so it
    // neither fills nor renumbers the container its path is spelled through.
    if (target.appendsChain) {
      continue;
    }

    if (target.liveKey != null) {
      pending.set(target.liveKey, (pending.get(target.liveKey) ?? 0) + 1);
    }

    if (target.positioned || entry.appendRenumbers) {
      renumbered.push({ ...target, by });
    }
  }
}

/**
 * The container a path names, but only when it is already there: nothing has
 * run yet, so this must not auto-create chains on the way down.
 * @param root - Parsed track root
 * @param segments - The container's segments below the root
 * @param chainsMemo - A drum rack's chains, once read for this call
 * @returns The container, or null when any step of the path is missing
 */
export function peekContainer(
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
 * Whether resolving a path makes a missing container: a pad's chain, a layer of
 * a pad, or a chain of a plain rack. Anything else fails its own way.
 * @param parent - What holds the container, when it is there
 * @param container - The container's segments
 * @returns True when the container is made on the way down
 */
export function makesContainer(
  parent: LiveAPI | null,
  container: CanonicalDeviceSegment[],
): boolean {
  const isDrumRack = (parent?.getProperty("can_have_drum_pads") as number) > 0;

  return (
    parent != null &&
    (container.at(-1)?.kind === "drum-pad"
      ? isDrumRack
      : // A layer of a pad, or a chain of a plain rack
        container.at(-2)?.kind === "drum-pad" ||
        ((parent.getProperty("can_have_chains") as number) > 0 && !isDrumRack))
  );
}

// --- Helpers below main exports ---

/**
 * Whether an entry is refused on its own turn: a slot past the end, or a move
 * or copy to nowhere.
 * @param target - Where the entry lands
 * @param words - The tool's words; none for create
 * @returns True when it fills, takes and moves nothing
 */
function changesNothing(
  target: InsertionTarget,
  words: InsertionWords | undefined,
): boolean {
  return (
    target.pastTheEnd ||
    (target.reachesNothing && words != null && words.verb !== "insert at")
  );
}

/**
 * A pad an entry renumbers: its layers, by spelling, since Live numbers a
 * drum rack's chains across the whole rack.
 * @param target - The pad, as a target
 * @param by - The entry that renumbers it
 * @returns The change
 */
function padChanged(target: InsertionTarget, by: string): Renumbered {
  return { ...target, key: target.padKey ?? target.key, liveKey: null, by };
}

/**
 * Whether a container that isn't there can't be made either: the first
 * missing step is the track, a device or a return chain.
 * @param root - Parsed track root
 * @param segments - The container's segments
 * @param chainsMemo - A drum rack's chains, once read for this call
 * @returns True when nothing a device goes in will be there
 */
function reachesNothing(
  root: TrackSegment,
  segments: CanonicalDeviceSegment[],
  chainsMemo: Map<string, LiveAPI[]>,
): boolean {
  // Called only when the whole container is missing, so the first missing
  // step is at or above it.
  let depth = 0;

  while (
    depth < segments.length &&
    peekContainer(root, segments.slice(0, depth), chainsMemo) != null
  ) {
    depth++;
  }

  const prefix = segments.slice(0, depth);
  const missing = prefix.at(-1);

  return (
    missing == null ||
    missing.kind === "device" ||
    missing.kind === "return-chain" ||
    !makesContainer(
      peekContainer(root, prefix.slice(0, -1), chainsMemo),
      prefix,
    )
  );
}

/**
 * The chain a moved object leaves, which renumbers when it goes.
 * @param from - The device's Live path, or the pad a drum chain leaves
 * @param pending - Devices earlier entries add, keyed by container
 * @param chainsMemo - A drum rack's chains, once read for this call
 * @param named - How the call named what moves
 * @returns The chain, or null for a pad path that names nothing
 */
function leaving(
  from: NonNullable<InsertionEntry["from"]>,
  pending: Map<string, number>,
  chainsMemo: Map<string, LiveAPI[]>,
  named = "it",
): Renumbered | null {
  const by = `the move of ${named}`;

  if ("pad" in from) {
    const pad = insertionTarget(from.pad, pending, chainsMemo);

    return pad == null ? null : padChanged(pad, by);
  }

  const chain = from.device.replace(/ devices \d+$/, "");
  const display = extractDevicePath(chain) ?? chain;

  return {
    display,
    key: display,
    padKey: null,
    liveKey: chain,
    reachesNothing: false,
    positioned: false,
    pastTheEnd: false,
    appendsChain: false,
    by,
  };
}

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
 * that names something a device doesn't go in (a scene) has no target: its
 * write is skipped on its own. Unparsable paths were refused before this runs.
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

  const count = chainSize(live, pending);
  const spelled = formatObjectPath({
    ...container,
    segments: segments.map(padByNote),
  });
  const isPad = segments.at(-1)?.kind === "drum-pad";

  return {
    display: formatObjectPath(container),
    key: isPad ? `${spelled}/c0` : spelled,
    padKey: isPad ? spelled : null,
    liveKey: live?.path ?? null,
    reachesNothing:
      live == null && reachesNothing(parsed.root, segments, chainsMemo),
    positioned:
      position != null && !(count != null && position === 0 && count === 0),
    pastTheEnd: position != null && count != null && position > count,
    appendsChain: parsed.appendsChain ?? false,
  };
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
 * How many devices a container will hold when an entry runs.
 * @param container - The container, when it already exists
 * @param pending - Devices earlier entries add, keyed by container
 * @returns The count, or null for a container that doesn't exist yet
 */
function chainSize(
  container: LiveAPI | null,
  pending: Map<string, number>,
): number | null {
  if (container == null) {
    return null;
  }

  return (
    container.getChildCount("devices") + (pending.get(container.path) ?? 0)
  );
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
