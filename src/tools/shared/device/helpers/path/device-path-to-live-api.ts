// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  formatDeviceSegment,
  formatObjectPath,
  liveApiCollection,
  parseObjectPath,
  type ObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import {
  requireDevicePath,
  trackSegmentPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { warnRackRelativeDrumChainSpelling } from "./device-drumpad-navigation.ts";
import { resolveDeviceTypeSegments } from "./device-type-segments.ts";
import { liveApiAtDevicePath } from "./with-device-path-cache.ts";

export type TargetType = "device" | "chain" | "drum-pad" | "return-chain";

export interface ResolvedPath {
  /** The path by position, for a result: `t0/d0/pC1/inst` becomes
   * `t0/d0/pC1/d0`. Left as written when a type segment named nothing, so an
   * error quotes what the caller wrote rather than a fallback index. */
  path: string;
  liveApiPath: string;
  targetType: TargetType;
  drumPadNote?: string;
  remainingSegments: string[];
  /** What the container does hold, when a type segment (`inst`, `afx1`) named
   * no device. The path resolves to nothing, and this is why. */
  namesNothing?: string;
}

/**
 * Resolves a device path to a Live API path.
 * @param path - e.g., "t1/d0", "t1/d0/c0", "rt0/d0", "mt/d0", "t1/d0/pC1"
 * @param label - Param name the path came from, for error messages
 * @returns Resolved path info
 */
export function resolvePathToLiveApi(
  path: string,
  label = "path",
): ResolvedPath {
  return resolveDevicePath(parseObjectPath(path, label), label);
}

/**
 * Resolves an already-parsed device path to a Live API path.
 * @param path - Parsed path
 * @param label - Param name the path came from, for error messages
 * @returns Resolved path info
 */
export function resolveDevicePath(
  path: ObjectPath,
  label = "path",
): ResolvedPath {
  const { root, segments } = requireDevicePath(path, label);
  // A segment naming a device by type becomes the position it resolves to, so
  // the walk below only ever indexes.
  const { segments: canonical, namesNothing } = resolveDeviceTypeSegments(
    root,
    segments,
  );
  const spelled = formatObjectPath(
    namesNothing == null ? { kind: "device", root, segments: canonical } : path,
  );
  const miss = namesNothing == null ? {} : { namesNothing };

  let liveApiPath = trackSegmentPath(root).toString();
  let targetType: TargetType = "device";

  for (const [index, segment] of canonical.entries()) {
    // Live indexes drum pads by MIDI note, so everything past one only resolves
    // against a live rack — hand the caller the tail to walk itself.
    if (segment.kind === "drum-pad") {
      return {
        path: spelled,
        liveApiPath,
        targetType: "drum-pad",
        drumPadNote: segment.note,
        remainingSegments: canonical.slice(index + 1).map(formatDeviceSegment),
        ...miss,
      };
    }

    liveApiPath += ` ${liveApiCollection(segment)} ${segment.index}`;
    targetType = segment.kind;

    if (segment.kind === "chain") {
      warnRackRelativeDrumChainSpelling(liveApiAtDevicePath(liveApiPath));
    }
  }

  return {
    path: spelled,
    liveApiPath,
    targetType,
    remainingSegments: [],
    ...miss,
  };
}

/**
 * What a path that found nothing reports, with why when a type segment is the
 * reason it did.
 * @param path - The path as the caller wrote it
 * @param reason - What the container does hold, from a resolution's namesNothing
 * @param label - Param name the path came from
 * @returns The miss, for the entry or error that carries it
 */
export function nothingAtPath(
  path: string,
  reason?: string,
  label = "path",
): string {
  const why = reason == null ? "" : `: ${reason}`;

  return `nothing at ${label} "${path}"${why}`;
}
