// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading select's `path` param. One grammar covers every shape select can act
// on, so the kind the path parses to picks the target.

import {
  formatObjectPath,
  parseObjectPath,
  pathError,
  type ObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import {
  namedHiddenPath,
  namedPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import { parseClipSlot } from "./select-id-helpers.ts";
import { type TrackCategory } from "./select-helpers.ts";

export interface PathTarget {
  parsedClipSlot?: { trackIndex: number; sceneIndex: number };
  devicePath?: string;
  /** The param devicePath came from, for messages the caller can act on. */
  devicePathParam?: "path" | "devicePath";
  trackIndex?: number;
  category?: TrackCategory;
  sceneIndex?: number;
}

interface PathParams {
  path?: string;
  slot?: string;
  devicePath?: string;
}

/**
 * Resolve `path` and the two params it replaced into what they name.
 * @param args - The path params as the tool received them
 * @param args.path - The path param
 * @param args.slot - The deprecated session slot
 * @param args.devicePath - The deprecated device path
 * @returns The clip slot, device, track, or scene the caller named
 */
export function resolvePathParam({
  path: rawPath,
  slot: rawSlot,
  devicePath: rawDevicePath,
}: PathParams): PathTarget {
  const path = namedPath(rawPath);
  const slot = namedHiddenPath(rawSlot);
  const devicePath = namedHiddenPath(rawDevicePath);

  if (path == null) {
    return {
      parsedClipSlot: slot == null ? undefined : parseClipSlot(slot),
      devicePath,
      devicePathParam: devicePath == null ? undefined : "devicePath",
    };
  }

  // Honoring one and dropping the other is the silent-wrong-target bug path
  // replaces, so refuse instead of picking.
  if (slot != null || devicePath != null) {
    throw new Error(
      "select failed: path and slot/devicePath both name a target; use path alone (the others are deprecated)",
    );
  }

  return targetFromPath(parseObjectPath(path, "path"));
}

/**
 * Combine a param with what `path` said, refusing to pick when they disagree —
 * honoring one and dropping the other is the silent wrong-target bug.
 * @param name - Param name, for the error
 * @param explicit - What the caller passed as its own param
 * @param fromPath - What the path named
 * @returns The agreed value, or whichever one was given
 */
export function mergeWithPath<T>(
  name: string,
  explicit: T | undefined,
  fromPath: T | undefined,
): T | undefined {
  if (explicit == null) return fromPath;
  if (fromPath == null || explicit === fromPath) return explicit;

  throw new Error(
    `select failed: path and ${name} name different targets; use path alone`,
  );
}

// --- Helpers below main exports ---

/**
 * Map a parsed path onto the target select acts on.
 * @param path - The parsed path
 * @returns What select should select
 */
function targetFromPath(path: ObjectPath): PathTarget {
  switch (path.kind) {
    case "device":
      return { devicePath: formatObjectPath(path), devicePathParam: "path" };
    case "track":
      return { trackIndex: path.trackIndex, category: "regular" };
    case "return-track":
      return { trackIndex: path.returnIndex, category: "return" };
    case "master-track":
      return { category: "master" };
    case "scene":
      return { sceneIndex: path.sceneIndex };
    case "slot":
      return {
        parsedClipSlot: {
          trackIndex: path.trackIndex,
          sceneIndex: path.sceneIndex,
        },
      };
    default:
      throw pathError(
        "path",
        formatObjectPath(path),
        'a take lane is not selectable; select a clip by id, or its track with "t<track>"',
      );
  }
}
