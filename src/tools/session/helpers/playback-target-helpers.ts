// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseCommaSeparatedIds } from "#src/tools/shared/utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import { type ObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  namedPath,
  namedHiddenPath,
  parseObjectPathList,
  requireSessionSlot,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import { parseSlotList } from "#src/tools/shared/validation/position-parsing.ts";

export interface SlotPosition {
  trackIndex: number;
  sceneIndex: number;
}

export interface PlaybackTarget {
  /** Scene named by a bare "s<scene>" path, for play-scene */
  sceneIndex: number | null;
  /** Session positions named by `path` or the deprecated `slots` */
  slotPositions: SlotPosition[] | null;
}

/**
 * Resolve what `path` names: a scene ("s3") for play-scene, or session
 * positions ("t0/s1") for the clip actions. The deprecated `slots` still names
 * positions, and refusing both beats guessing which the caller meant.
 * @param path - A scene, or comma-separated session positions
 * @param slots - Deprecated comma-separated trackIndex/sceneIndex positions
 * @returns What the params named, null where they named nothing
 */
export function resolvePlaybackTarget(
  path: string | undefined,
  slots: string | undefined,
): PlaybackTarget {
  const named = namedPath(path);
  const legacy = namedHiddenPath(slots);

  if (named != null && legacy != null) {
    throw new Error(
      "playback failed: path and slots both name clips; use path alone (slots is deprecated)",
    );
  }

  if (named == null) {
    return {
      sceneIndex: null,
      slotPositions: legacy != null ? parseSlotList(legacy, "slots") : null,
    };
  }

  const parsed = parseObjectPathList(named, "path");
  const scene = parsed.find(
    (entry): entry is Extract<ObjectPath, { kind: "scene" }> =>
      entry.kind === "scene",
  );

  if (scene == null) {
    return {
      sceneIndex: null,
      slotPositions: parsed.map((entry) => requireSessionSlot(entry, "path")),
    };
  }

  // A scene launches every track at once, so a list naming one alongside
  // anything else is a caller who meant something else.
  if (parsed.length > 1) {
    throw new Error(
      'playback failed: path names one scene ("s<scene>") or session positions ("t<track>/s<scene>"), not a mix',
    );
  }

  return { sceneIndex: scene.sceneIndex, slotPositions: null };
}

/**
 * Resolve clip slot positions from either ids or the resolved path positions
 * @param ids - Comma-separated clip IDs
 * @param slotPositions - Resolved session positions, or null when none given
 * @param action - Action name for error messages
 * @returns Array of slot positions
 */
export function resolveClipSlotPositions(
  ids: string | undefined,
  slotPositions: SlotPosition[] | null,
  action: string,
): SlotPosition[] {
  if (slotPositions != null) {
    return slotPositions;
  }

  if (ids == null) {
    throw new Error(
      `playback failed: ids or path is required for action "${action}"`,
    );
  }

  const clipIdList = parseCommaSeparatedIds(ids);
  const clips = validateIdTypes(clipIdList, "clip", "playback", {
    skipInvalid: true,
  });

  return clips.map((clip) => {
    const { trackIndex, sceneIndex } = clip;

    if (trackIndex == null || sceneIndex == null) {
      throw new Error(
        `playback ${action} action failed: could not determine track/scene for clipId=${clip.id}`,
      );
    }

    return { trackIndex, sceneIndex };
  });
}
