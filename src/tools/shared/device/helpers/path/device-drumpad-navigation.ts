// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { noteNameToMidi } from "#src/shared/pitch.ts";
import { assertDefined } from "#src/tools/shared/utils.ts";

export type DrumPadTargetType = "chain" | "device";

export interface DrumPadResolution {
  target: LiveAPI | null;
  targetType: DrumPadTargetType;
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
  if (Number.isNaN(index)) return null;
  const c = parent.getChildren(childType);

  return index >= 0 && index < c.length ? (c[index] ?? null) : null;
}

/**
 * Navigate through remaining path segments after reaching a device.
 * @param startDevice - Starting device
 * @param segments - Remaining path segments with prefixes (c, d, rc, p)
 * @returns The resolved target and its type
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- drum pad path navigation requires handling multiple segment types in one loop
function navigateRemainingSegments(
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
  const device = LiveAPI.from(liveApiPath);

  if (!device.exists()) {
    return { target: null, targetType: "chain" };
  }

  const allChains = device.getChildren("chains");

  // Determine target in_note: "*" means catch-all (-1), otherwise convert note name
  const targetInNote = drumPadNote === "*" ? -1 : noteNameToMidi(drumPadNote);

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

  // Find chains with matching in_note
  const matchingChains = allChains.filter(
    (c) => c.getProperty("in_note") === targetInNote,
  );

  if (
    chainIndexWithinNote < 0 ||
    chainIndexWithinNote >= matchingChains.length
  ) {
    return { target: null, targetType: "chain" };
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
  const devices = chain.getChildren("devices");

  if (
    Number.isNaN(deviceIndex) ||
    deviceIndex < 0 ||
    deviceIndex >= devices.length
  ) {
    return { target: null, targetType: "device" };
  }

  const targetDevice = assertDefined(
    devices[deviceIndex],
    `device at index ${deviceIndex}`,
  );

  // Check if there are more segments after the device index
  const afterDeviceSegments = nextSegments.slice(1);

  if (afterDeviceSegments.length === 0) {
    return { target: targetDevice, targetType: "device" };
  }

  // Navigate through remaining segments (chains/devices in nested racks)
  return navigateRemainingSegments(targetDevice, afterDeviceSegments);
}
