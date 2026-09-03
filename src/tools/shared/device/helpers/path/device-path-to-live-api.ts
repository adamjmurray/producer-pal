// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  formatDeviceSegment,
  liveApiCollection,
  parseObjectPath,
  type ObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import {
  requireDevicePath,
  trackSegmentPath,
} from "#src/tools/shared/validation/helpers/object-path-helpers.ts";

export type TargetType = "device" | "chain" | "drum-pad" | "return-chain";

export interface ResolvedPath {
  liveApiPath: string;
  targetType: TargetType;
  drumPadNote?: string;
  remainingSegments: string[];
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

  let liveApiPath = trackSegmentPath(root).toString();
  let targetType: TargetType = "device";

  for (const [index, segment] of segments.entries()) {
    // Live indexes drum pads by MIDI note, so everything past one only resolves
    // against a live rack — hand the caller the tail to walk itself.
    if (segment.kind === "drum-pad") {
      return {
        liveApiPath,
        targetType: "drum-pad",
        drumPadNote: segment.note,
        remainingSegments: segments.slice(index + 1).map(formatDeviceSegment),
      };
    }

    liveApiPath += ` ${liveApiCollection(segment)} ${segment.index}`;
    targetType = segment.kind;
  }

  return { liveApiPath, targetType, remainingSegments: [] };
}
