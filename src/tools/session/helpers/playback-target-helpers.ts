// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { namedParam, parseCommaSeparatedIds } from "#src/tools/shared/utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import { type ObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
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
  /** `ids` as the caller named it, or undefined when it names no clip */
  ids: string | undefined;
}

export interface PlaybackTargetParams {
  ids?: string;
  path?: string;
  slots?: string;
}

/** The actions that read a target. The rest act on the transport alone. */
const TARGETING_ACTIONS = new Set([
  "play-scene",
  "play-session-clips",
  "stop-session-clips",
]);

/**
 * Resolve what the target params name: a scene ("s3") for play-scene, or
 * session positions ("t0/s1") for the clip actions. The deprecated `slots`
 * still names positions, and refusing both beats guessing which the caller
 * meant.
 * @param action - The playback action, which decides whether a target applies
 * @param params - The raw target params
 * @param params.ids - Comma-separated clip IDs
 * @param params.path - A scene, or comma-separated session positions
 * @param params.slots - Deprecated comma-separated trackIndex/sceneIndex positions
 * @returns What the params named, null where they named nothing
 */
export function resolvePlaybackTarget(
  action: string,
  { ids, path, slots }: PlaybackTargetParams,
): PlaybackTarget {
  const namedIds = namedParam(ids, "ids");

  // Parsing these for an action that never reads them turns a leftover param
  // into a failed transport command: `stop` has to stop.
  if (!TARGETING_ACTIONS.has(action)) {
    warnUnusedTarget(action, path, slots, namedIds);

    return { sceneIndex: null, slotPositions: null, ids: undefined };
  }

  const target = resolvePathTarget(path, slots);

  if (namedIds != null && target.slotPositions != null) {
    throw new Error("playback failed: ids and path are mutually exclusive");
  }

  return { ...target, ids: namedIds };
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

// --- Helpers below main exports ---

/**
 * Resolve what `path` or the deprecated `slots` names.
 * @param path - A scene, or comma-separated session positions
 * @param slots - Deprecated comma-separated trackIndex/sceneIndex positions
 * @returns The scene or positions named, null where nothing was
 */
function resolvePathTarget(
  path: string | undefined,
  slots: string | undefined,
): Omit<PlaybackTarget, "ids"> {
  const named = namedParam(path, "path");
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
 * Warns for target params on an action that has no target to apply them to.
 * @param action - The playback action
 * @param path - Raw path param
 * @param slots - Raw deprecated slots param
 * @param ids - Normalized ids param
 */
function warnUnusedTarget(
  action: string,
  path: string | undefined,
  slots: string | undefined,
  ids: string | undefined,
): void {
  const sent = [
    namedParam(path, "path") != null ? "path" : null,
    namedHiddenPath(slots) != null ? "slots" : null,
    ids != null ? "ids" : null,
  ].filter((param) => param != null);

  if (sent.length === 0) return;

  console.warn(
    `${sent.join("/")} ignored: action "${action}" names no clips to act on`,
  );
}
