// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type CreatedChains,
  appendChain,
  resolveContainerWithAutoCreate,
  resolveOrCreateDrumPadChain,
} from "#src/tools/shared/device/helpers/chain-auto-creation.ts";
import {
  requireDeviceContainer,
  trackSegmentPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { DEVICE_TYPE_FORMS } from "#src/tools/shared/validation/helpers/object-path-device-tail.ts";
import { NEW_CHAIN } from "#src/tools/shared/validation/helpers/object-path-lexer.ts";
import {
  objectPathForApi,
  pathPrefix,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  formatObjectPath,
  namesDevice,
  parseObjectPath,
  type CanonicalDeviceSegment,
  type DeviceSegment,
  type IndexedSegment,
  type TrackSegment,
} from "#src/tools/shared/validation/object-path.ts";
import { resolveDevicePath } from "./device-path-to-live-api.ts";
import { resolveDeviceTypeSegments } from "./device-type-segments.ts";
import { liveApiAtDevicePath } from "./with-device-path-cache.ts";

// Re-export all functions for backwards compatibility
export { extractDevicePath } from "./device-path-builders.ts";
export { buildChainPath } from "./device-path-builders.ts";
export { buildReturnChainPath } from "./device-path-builders.ts";
export { buildDrumPadPath } from "./device-path-builders.ts";
export { resolvePathToLiveApi } from "./device-path-to-live-api.ts";
export {
  findDrumPad,
  resolveDrumPadFromPath,
} from "./device-drumpad-navigation.ts";

/**
 * A trailing device position, for a path the grammar couldn't parse. Spelled
 * from the grammar's own device forms so it can't fall behind them.
 */
const TRAILING_POSITION = new RegExp(
  `/(?:d\\d+|d\\+|(?:${Object.values(DEVICE_TYPE_FORMS)
    .flatMap((form) => [form.segment, form.long])
    .join("|")})\\d*)$`,
);

export interface InsertionPathResolution {
  container: LiveAPI | null;
  position: number | null;
  /** The path ended in `d+`, which names the end of the container rather than
   * a slot in it. Only set when it did. */
  appendsDevice?: boolean;
  /** What the container does hold, when a type-addressed segment (`inst`,
   * `afx1`) named no device. The container may well exist. */
  namesNothing?: string;
  /** How the call spelled the container, so a result can hand back the
   * caller's own spelling of a drum chain rather than the rack-relative one. */
  containerPath: string;
  /** The rack chains the path had to make first ("c2-c3"), when it made any.
   * Numbered within the rack the path names. */
  createdChains?: string;
}

/**
 * Resolve a path to a container (track or chain) for device insertion.
 * A trailing `d+` appends to the container above it; a path ending in a device
 * index names that position. A bare container (t, rt, mt, c, rc, p) resolves
 * with no position, which every tool treats as append — `d+` is just the
 * spelling to teach.
 *
 * Examples:
 * - "t0/d+" -> track 0, append
 * - "t0/d3" -> track 0, position 3
 * - "t0/d0/c0/d+" -> chain 0 of device 0 on track 0, append
 * - "t0/d0/c0/d1" -> chain 0 of device 0 on track 0, position 1
 * - "t0/d0/pC1/d+" -> drum pad C1 chain 0, append
 * - "rt0/d0" -> return track 0, device 0; "mt/d0" -> master track
 *
 * @param path - Device insertion path
 * @param label - Param name the path came from, for error messages
 * @returns Container, optional position, and the container's spelling
 */
export function resolveInsertionPath(
  path: string,
  label = "path",
): InsertionPathResolution {
  const {
    root,
    segments,
    appendsChain = false,
    appendsDevice = false,
  } = requireDeviceContainer(parseObjectPath(path, label), label);
  // A trailing `inst`/`mfx<n>`/`afx<n>` is a position like `d<n>`, so it has to
  // become one before the position is read off it.
  const { segments: canonical, namesNothing } = resolveDeviceTypeSegments(
    root,
    segments,
  );
  const resolved = namesNothing == null;
  const last = canonical.at(-1);
  // Neither `c+` nor `d+` names an object inside its container, so nothing is
  // trimmed off them.
  const appends = appendsChain || appendsDevice;
  const held = <T extends DeviceSegment>(list: T[]): T[] =>
    appends ? list : containerSegments(list);
  const above = held(canonical);
  // A type-addressed segment that named no device makes a canonical spelling
  // name the wrong thing — echo what the call wrote instead.
  const spelled = resolved ? above : held(segments);
  const created: CreatedChains = [];
  const container = resolved
    ? resolveContainer(root, above, path, appendsChain, created)
    : null;

  return {
    container,
    position: !appends && last?.kind === "device" ? last.index : null,
    ...(appendsDevice ? { appendsDevice } : {}),
    ...(resolved ? {} : { namesNothing }),
    ...(created.length > 0 ? { createdChains: created.join(", ") } : {}),
    // The chain a `c+` made has an index only now that it exists, and the
    // result has to name it rather than the `c+` the call wrote.
    containerPath:
      (appendsChain && container != null
        ? objectPathForApi(container)
        : null) ??
      formatObjectPath({ kind: "device", root, segments: spelled }),
  };
}

/**
 * How a call spelled the container an insertion path names — the path itself,
 * or everything above a trailing `d<n>` position or `d+`. Parsing only, so a
 * result can echo the caller's own spelling without a Live read.
 *
 * A path that doesn't parse comes back trimmed lexically rather than throwing:
 * this only names what a result already has, so it must not turn a completed
 * operation into an error — but it must never hand back a path that still
 * names the object inside the container.
 * @param path - Device insertion path
 * @param label - Param name the path came from, for error messages
 * @returns The container's path (e.g. "t0/d0/pC1/c1" from "t0/d0/pC1/c1/d2")
 */
export function insertionContainerPath(path: string, label = "path"): string {
  try {
    const parsed = requireDeviceContainer(parseObjectPath(path, label), label);

    // A `c+` names the container itself, so there is nothing above it to trim
    // — and the chain it makes has no index until it exists. A `d+` leaves its
    // container in the segments, so formatting them drops it.
    return parsed.appendsChain
      ? path.trim()
      : formatObjectPath({
          kind: "device",
          root: parsed.root,
          segments: containerSegments(parsed.segments),
        });
  } catch {
    return path.replace(TRAILING_POSITION, "");
  }
}

// --- Helpers below main exports ---

/**
 * The segments naming the container, dropping a trailing device position.
 * @param segments - Device-chain segments below the root
 * @returns The container's segments
 */
function containerSegments<T extends DeviceSegment>(segments: T[]): T[] {
  return namesDevice(segments.at(-1)) ? segments.slice(0, -1) : segments;
}

/**
 * Resolve a container path (track or chain) to a LiveAPI object.
 * Auto-creates missing chains for regular racks. Throws for Drum Racks.
 * @param root - Parsed track root
 * @param segments - Device-chain segments below the root
 * @param path - Original path, for error messages
 * @param appendsChain - Whether the path ended in `c+`
 * @param created - Chain ranges the path made on the way down, added to
 * @returns LiveAPI object (Track or Chain)
 */
function resolveContainer(
  root: TrackSegment,
  segments: CanonicalDeviceSegment[],
  path: string,
  appendsChain: boolean,
  created: CreatedChains,
): LiveAPI | null {
  const indexed = segments.filter(
    (segment): segment is IndexedSegment => segment.kind !== "drum-pad",
  );

  // A drum pad resolves by MIDI note against a live rack, so the whole path
  // goes through the pad navigator rather than the chain walker.
  if (indexed.length !== segments.length) {
    return resolveDrumPadContainer(root, segments, path, appendsChain, created);
  }

  const container =
    indexed.length === 0
      ? liveApiAtDevicePath(trackSegmentPath(root).toString())
      : resolveContainerWithAutoCreate(root, indexed, path, created);

  return appendsChain ? appendChainTo(container, path) : container;
}

/**
 * Resolve a drum pad container path with auto-creation of missing chains
 * @param root - Parsed track root
 * @param segments - Device-chain segments, at least one of them a drum pad
 * @param path - Original path, for error messages
 * @param appendsChain - Whether the path ended in `c+`
 * @param created - Chain ranges the path made on the way down, added to
 * @returns LiveAPI object (Chain)
 */
function resolveDrumPadContainer(
  root: TrackSegment,
  segments: CanonicalDeviceSegment[],
  path: string,
  appendsChain: boolean,
  created: CreatedChains,
): LiveAPI | null {
  const resolved = resolveDevicePath({ kind: "device", root, segments });
  const rack = liveApiAtDevicePath(resolved.liveApiPath);
  // The path had a drum pad segment, so resolution stopped at one
  const note = resolved.drumPadNote as string;
  const tail = resolved.remainingSegments;

  // A `c+` straight after the pad appends a layer to it, which only the pad
  // navigator can do — Live indexes a drum chain by note, not by position.
  if (appendsChain && tail.length === 0) {
    return resolveOrCreateDrumPadChain(rack, note, [NEW_CHAIN]);
  }

  const container = resolveOrCreateDrumPadChain(rack, note, tail, created);

  // Deeper down, the `c+` belongs to a rack nested under the pad.
  return appendsChain && container != null
    ? appendChainTo(container, path)
    : container;
}

/**
 * Append a chain to the rack a `c+` path names.
 * @param rack - The device the `c+` sits under
 * @param path - The path as the caller wrote it, for error messages
 * @returns The new chain
 * @throws Error when the device takes no chain, or Live made none
 */
function appendChainTo(rack: LiveAPI, path: string): LiveAPI {
  // A new chain arrives on the catch-all pad, which plays every note no pad
  // claims — a surprise no result text undoes, and the reason cN refuses a
  // Drum Rack too. A pad path has a note to land on.
  if ((rack.getProperty("can_have_drum_pads") as number) > 0) {
    throw new Error(
      `"${path}" appends a chain to a Drum Rack, where every chain belongs to ` +
        `a pad; name the pad instead (e.g. "${pathPrefix(rack)}/pC1/${NEW_CHAIN}")`,
    );
  }

  if (!rack.getProperty("can_have_chains")) {
    throw new Error(`"${path}" appends a chain to a device that has none`);
  }

  const created = appendChain(rack);

  if (created == null) {
    throw new Error(`could not append a chain at "${path}"`);
  }

  return created;
}
