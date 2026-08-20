// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { namedParam, parseCommaSeparatedIds } from "#src/tools/shared/utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import {
  pathError,
  type ObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
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

/** The param a target came from, and its value, for shape errors */
interface PathSource {
  label: string;
  input: string;
}

interface PathTarget extends Omit<PlaybackTarget, "ids"> {
  source: PathSource | null;
}

/** The one targeting action that takes a scene. The others take clips. */
const PLAY_SCENE = "play-scene";

/** The actions that read a target. The rest act on the transport alone. */
const TARGETING_ACTIONS = new Set([
  PLAY_SCENE,
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

  const { source, ...target } = resolvePathTarget(path, slots);

  // Both name what to act on, so refusing beats guessing which the caller meant.
  if (namedIds != null && source != null) {
    throw new Error(
      `playback failed: ids and ${source.label} are mutually exclusive`,
    );
  }

  assertTargetShape(action, target, source);

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
 * @returns The scene or positions named, null where nothing was, and which
 *   param named it
 */
function resolvePathTarget(
  path: string | undefined,
  slots: string | undefined,
): PathTarget {
  const named = namedParam(path, "path");
  const legacy = namedHiddenPath(slots);

  if (named != null && legacy != null) {
    throw new Error(
      "playback failed: path and slots both name clips; use path alone (slots is deprecated)",
    );
  }

  if (named == null) {
    if (legacy == null) {
      return { sceneIndex: null, slotPositions: null, source: null };
    }

    // parseSlotList drops empty entries with a warning, so a value like ","
    // parses to no positions at all. An empty list reads downstream as "act on
    // these zero slots" — a silent no-op — so report it as the nothing it is.
    const positions = parseSlotList(legacy, "slots");

    if (positions.length === 0) {
      return { sceneIndex: null, slotPositions: null, source: null };
    }

    return {
      sceneIndex: null,
      slotPositions: positions,
      source: { label: "slots", input: legacy },
    };
  }

  const source = { label: "path", input: named };
  const parsed = parseObjectPathList(named, "path");
  const scene = parsed.find(
    (entry): entry is Extract<ObjectPath, { kind: "scene" }> =>
      entry.kind === "scene",
  );

  if (scene == null) {
    return {
      sceneIndex: null,
      slotPositions: parsed.map((entry) => requireSessionSlot(entry, "path")),
      source,
    };
  }

  // A scene launches every track at once, so a list naming one alongside
  // anything else is a caller who meant something else.
  if (parsed.length > 1) {
    throw new Error(
      'playback failed: path names one scene ("s<scene>") or session positions ("t<track>/s<scene>"), not a mix',
    );
  }

  return { sceneIndex: scene.sceneIndex, slotPositions: null, source };
}

/**
 * Refuse a path whose shape is wrong for the action. Each handler reads only
 * its own kind of target, so without this a wrong-shaped path falls through to
 * a "you gave me nothing" error about the very param the caller did send.
 * @param action - The playback action
 * @param target - What the path named
 * @param target.sceneIndex - The scene named, or null
 * @param target.slotPositions - The session positions named, or null
 * @param source - The param that named it, or null when neither did
 */
function assertTargetShape(
  action: string,
  { sceneIndex, slotPositions }: Omit<PlaybackTarget, "ids">,
  source: PathSource | null,
): void {
  if (source == null) return;

  if (action === PLAY_SCENE && slotPositions != null) {
    // Non-empty by construction: a path or slots naming nothing is reported as
    // naming nothing, so it never reaches here with an empty list.
    const { sceneIndex: scene } = slotPositions[0] as SlotPosition;

    throw pathError(
      source.label,
      source.input,
      `names a session position; action "${PLAY_SCENE}" takes one scene, ` +
        `as path "s${scene}" or sceneIndex ${scene}`,
    );
  }

  if (action !== PLAY_SCENE && sceneIndex != null) {
    const wholeScene =
      action === "play-session-clips"
        ? `, or use action "${PLAY_SCENE}" for the whole scene`
        : "";

    throw pathError(
      source.label,
      source.input,
      `names a scene; action "${action}" takes session positions ` +
        `"t<track>/s<scene>" (e.g., "t0/s${sceneIndex}")${wholeScene}`,
    );
  }
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
