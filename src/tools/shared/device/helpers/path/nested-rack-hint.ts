// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { nestedDrumRackHint } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { resolveDevicePath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import {
  NEW_CHAIN,
  NEW_DEVICE,
} from "#src/tools/shared/validation/helpers/object-path-lexer.ts";
import { requireDeviceContainer } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";

/**
 * The "did you mean" for a pad path that missed because the Drum Rack is nested
 * inside another rack. Safe to call on any device path, including one ending in
 * `c+` or `d+`.
 * @param path - A device path the call named, already known to parse
 * @param label - Param name the path came from
 * @returns The hint to append to the miss, or "" when the path names no pad or
 *   there is no nested kit to point at
 */
export function nestedRackHintForPath(path: string, label = "path"): string {
  const { root, segments, appendsChain, appendsDevice } =
    requireDeviceContainer(parseObjectPath(path, label, true), label);

  // Only a pad can be missed by nesting. This also keeps a bare track, which
  // resolves to no device, out of the resolver below.
  if (!segments.some((segment) => segment.kind === "drum-pad")) {
    return "";
  }

  const { drumPadNote, liveApiPath, remainingSegments } = resolveDevicePath({
    kind: "device",
    root,
    segments,
  });

  // A pad segment always stops resolution at it, so the note is set.
  const note = drumPadNote as string;

  // Keep the marker, so the suggestion still means what the call asked for.
  const marker = appendsChain ? [NEW_CHAIN] : appendsDevice ? [NEW_DEVICE] : [];

  return nestedDrumRackHint(liveApiPath, note, [
    ...remainingSegments,
    ...marker,
  ]);
}
