// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-utils.ts";
import { midiToNoteName, noteNameToMidi } from "#src/shared/pitch.ts";
import { fromLiveApiId } from "#src/tools/shared/utils.ts";
import { buildDrumPadPath, extractDevicePath } from "./device-path-builders.ts";
import { cachedDevicePath } from "./with-device-path-cache.ts";

export type DrumPadTargetType = "chain" | "device";

const DRUM_PADS_TAIL = / drum_pads \d+$/;

export interface DrumPadResolution {
  target: LiveAPI | null;
  targetType: DrumPadTargetType;
  /** How many chains the pad already holds. Only a chain miss sets it, and only
   * so a caller that has to create one doesn't count them a second time. */
  chainCount?: number;
}

export interface DrumPadGroup {
  /** The DrumPad object, or null when the rack has none: the catch-all has no
   * pad, and neither does a Drum Rack nested inside a drum pad. */
  pad: LiveAPI | null;
  /** Every chain on the pad, in rack order */
  chains: LiveAPI[];
}

/**
 * Get a child at a specific index from a LiveAPI parent
 * @param parent - Parent LiveAPI object
 * @param childType - Type of children ("devices", "chains", etc.)
 * @param index - Child index
 * @returns Child object or null if invalid
 */
function getChildAtIndex(
  parent: LiveAPI,
  childType: string,
  index: number,
): LiveAPI | null {
  if (Number.isNaN(index) || index < 0) return null;

  return parent.getChildAt(childType, index);
}

/**
 * Navigate through path segments relative to a starting device/rack. Pure
 * read-only resolution (no auto-creation); used both for nested drum-rack
 * navigation and to resolve a path-prefixed pseudo-param's target relative to
 * the rack being created/updated.
 * @param startDevice - Starting device (or rack)
 * @param segments - Path segments with prefixes (c, d, rc, p)
 * @returns The resolved target and its type
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- drum pad path navigation requires handling multiple segment types in one loop
export function navigateRemainingSegments(
  startDevice: LiveAPI,
  segments: string[],
): DrumPadResolution {
  let current: LiveAPI = startDevice;
  let currentType: DrumPadTargetType = "device";

  for (let i = 0; i < segments.length; i++) {
    const seg = assertDefined(segments[i], `segment at index ${i}`);

    if (seg.startsWith("p")) {
      const n = seg.slice(1);

      return n
        ? resolveDrumPadFromPath(current.path, n, segments.slice(i + 1))
        : { target: null, targetType: "chain" };
    }

    const isRc = seg.startsWith("rc");

    if (isRc || seg.startsWith("c")) {
      const c = getChildAtIndex(
        current,
        isRc ? "return_chains" : "chains",
        Number.parseInt(seg.slice(isRc ? 2 : 1)),
      );

      if (!c) return { target: null, targetType: "chain" };
      current = c;
      currentType = "chain";
    } else if (seg.startsWith("d")) {
      const c = getChildAtIndex(
        current,
        "devices",
        Number.parseInt(seg.slice(1)),
      );

      if (!c) return { target: null, targetType: "device" };
      current = c;
      currentType = "device";
    } else {
      return { target: null, targetType: currentType };
    }
  }

  return { target: current, targetType: currentType };
}

/**
 * Map a drum rack's pad IDs by the MIDI note each pad answers to. A Drum Rack
 * nested inside a drum pad has no pads of its own, so its map is empty and its
 * pads serialize without an id — that's Live, not a short read. See
 * dev/Coding-Standards.md, "A Drum Rack Inside a Drum Pad Has No Pads".
 *
 * Live gives a rack one pad per MIDI note — 128 of them, whatever the kit — and
 * lists them in note order, so the ids come straight off the list and the index
 * is the note. Building all 128 to read `note` off each cost 128 objects on
 * every drum read, to name the handful of pads a kit uses.
 *
 * The order is checked, not trusted: one pad is built and asked its note. A
 * mapping that quietly comes out shifted would rename every drum, and the list
 * order is Live's convention rather than a documented guarantee.
 * @param rack - The drum rack device
 * @returns Pad ID keyed by MIDI note
 */
export function drumPadIdsByNote(rack: LiveAPI): Map<number, string> {
  const padIds = rack.getChildIds("drum_pads");
  const first = padIds.length > 0 ? LiveAPI.from(padIds[0] as string) : null;

  if (first != null && first.getProperty("note") === 0) {
    // getChildIds gives the "id N" form; a pad id that reaches a result is bare.
    return new Map(padIds.map((padId, note) => [note, fromLiveApiId(padId)]));
  }

  const idsByNote = new Map<number, string>();

  for (const pad of rack.getChildren("drum_pads")) {
    idsByNote.set(pad.getProperty("note") as number, pad.id);
  }

  return idsByNote;
}

/**
 * Find the DrumPad object for a note on a drum rack. Pad-level operations need
 * the pad itself, not its chain — `delete_all_chains` and `copy_pad` are silent
 * no-ops when aimed at a chain.
 * @param rackPath - Live API path to the drum rack
 * @param note - Pad note name (e.g. "C1")
 * @returns The DrumPad, or null if the rack or pad doesn't exist
 */
export function findDrumPad(rackPath: string, note: string): LiveAPI | null {
  const rack = LiveAPI.from(rackPath);

  if (!rack.exists()) return null;

  const midi = noteNameToMidi(note);

  return midi == null ? null : findDrumPadByNote(rack, midi);
}

/**
 * Find the DrumPad a rack maps a MIDI note to.
 * @param rack - The drum rack device
 * @param midi - MIDI note number
 * @returns The DrumPad, or null when the rack has no pad for that note
 */
export function findDrumPadByNote(rack: LiveAPI, midi: number): LiveAPI | null {
  const padId = drumPadIdsByNote(rack).get(midi);

  return padId == null ? null : LiveAPI.from(padId);
}

/**
 * Convert a pad path's note segment to the `in_note` it selects.
 * @param drumPadNote - Note name (e.g. "C1"), or "*" for the catch-all
 * @returns The in_note value, or null when the segment isn't a note
 */
function padNoteToInNote(drumPadNote: string): number | null {
  return drumPadNote === "*" ? -1 : noteNameToMidi(drumPadNote);
}

/**
 * Every chain a drum rack routes to one pad.
 * @param rack - The drum rack device
 * @param inNote - The pad's in_note (-1 for the catch-all)
 * @returns The chains, in rack order
 */
export function chainsForInNote(rack: LiveAPI, inNote: number): LiveAPI[] {
  return rack
    .getChildren("chains")
    .filter((c) => c.getProperty("in_note") === inNote);
}

/**
 * Every chain on a DrumPad, in the order its `c0`/`c1` path segments name.
 *
 * Read from the rack rather than from `pad.chains`: measured on 12.4.3 the two
 * disagree once a pad holds more than one chain (a copied-on layer comes first
 * in the rack's list and last in the pad's), and every path resolves against
 * the rack's, so the pad's would label the layers with each other's paths.
 * @param pad - The DrumPad
 * @returns The pad's chains, in rack order
 */
export function chainsOnDrumPad(pad: LiveAPI): LiveAPI[] {
  const rack = LiveAPI.from(pad.path.replace(DRUM_PADS_TAIL, ""));

  return chainsForInNote(rack, pad.getProperty("note") as number);
}

/**
 * The path that names a DrumPad, e.g. "t1/d0/pC1". Both casts hold for any real
 * pad: it always sits on a track's device, and its note is always 0-127.
 * @param pad - The DrumPad
 * @returns Its Producer Pal path
 */
export function drumPadPath(pad: LiveAPI): string {
  const rackPath = pad.path.replace(DRUM_PADS_TAIL, "");

  return buildDrumPadPath(
    extractDevicePath(rackPath) as string,
    midiToNoteName(pad.getProperty("note") as number) as string,
  );
}

/**
 * Resolve a bare pad path to the whole pad: the DrumPad object plus every chain
 * on it. A layered pad has several chains; a virtual pad has no DrumPad.
 * @param liveApiPath - Live API path to the drum rack device
 * @param drumPadNote - Note name (e.g. "C1"), or "*" for the catch-all
 * @returns The pad and its chains, or null when the rack or the pad is empty
 */
export function resolveDrumPadGroup(
  liveApiPath: string,
  drumPadNote: string,
): DrumPadGroup | null {
  const rack = LiveAPI.from(liveApiPath);

  if (!rack.exists()) return null;

  const inNote = padNoteToInNote(drumPadNote);

  if (inNote == null) return null;

  const chains = chainsForInNote(rack, inNote);

  if (chains.length === 0) return null;

  return { pad: findDrumPadByNote(rack, inNote), chains };
}

/**
 * Resolve a drum pad path to its target LiveAPI object. Supports nested drum racks.
 * @param liveApiPath - Live API path to the drum rack device
 * @param drumPadNote - Note name (e.g., "C1", "F#2") or "*" for catch-all
 * @param remainingSegments - Path segments after drum pad (c/d prefixed)
 * @returns The resolved target and its type
 */
export function resolveDrumPadFromPath(
  liveApiPath: string,
  drumPadNote: string,
  remainingSegments: string[],
): DrumPadResolution {
  const device = cachedDevicePath(liveApiPath);

  if (!device.exists()) {
    return { target: null, targetType: "chain" };
  }

  const targetInNote = padNoteToInNote(drumPadNote);

  if (targetInNote == null) {
    return { target: null, targetType: "chain" };
  }

  // Chain index from first remaining segment if it's a 'c' prefix (defaults to 0)
  let chainIndexWithinNote = 0;
  let nextSegmentStart = 0;

  if (remainingSegments.length > 0) {
    const firstSegment = assertDefined(remainingSegments[0], "first segment");

    // Only consume segment if it's a chain index (c prefix)
    if (firstSegment.startsWith("c")) {
      chainIndexWithinNote = Number.parseInt(firstSegment.slice(1));

      if (Number.isNaN(chainIndexWithinNote)) {
        return { target: null, targetType: "chain" };
      }

      nextSegmentStart = 1;
    }
  }

  const matchingChains = chainsForInNote(device, targetInNote);

  if (
    chainIndexWithinNote < 0 ||
    chainIndexWithinNote >= matchingChains.length
  ) {
    return {
      target: null,
      targetType: "chain",
      chainCount: matchingChains.length,
    };
  }

  const chain = assertDefined(
    matchingChains[chainIndexWithinNote],
    `chain at index ${chainIndexWithinNote}`,
  );

  // Check if we need to navigate further
  const nextSegments = remainingSegments.slice(nextSegmentStart);

  if (nextSegments.length === 0) {
    return { target: chain, targetType: "chain" };
  }

  // Navigate to device within chain (d prefix)
  const deviceSegment = assertDefined(nextSegments[0], "device segment");

  if (!deviceSegment.startsWith("d")) {
    return { target: null, targetType: "device" };
  }

  const deviceIndex = Number.parseInt(deviceSegment.slice(1));
  // By id: indexing into getChildren would build every device in the chain to
  // name one.
  const deviceIds = chain.getChildIds("devices");

  if (
    Number.isNaN(deviceIndex) ||
    deviceIndex < 0 ||
    deviceIndex >= deviceIds.length
  ) {
    return { target: null, targetType: "device" };
  }

  const targetDevice = LiveAPI.from(
    assertDefined(deviceIds[deviceIndex], `device at index ${deviceIndex}`),
  );

  // Check if there are more segments after the device index
  const afterDeviceSegments = nextSegments.slice(1);

  if (afterDeviceSegments.length === 0) {
    return { target: targetDevice, targetType: "device" };
  }

  // Navigate through remaining segments (chains/devices in nested racks)
  return navigateRemainingSegments(targetDevice, afterDeviceSegments);
}
