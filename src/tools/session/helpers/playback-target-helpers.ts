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
  /** The one scene to play, agreed by every param that named one */
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
  sceneIndex?: number;
}

/** The param a target came from, and its value, for shape errors */
interface PathSource {
  label: string;
  input: string;
}

interface PathTarget extends Omit<PlaybackTarget, "ids"> {
  source: PathSource | null;
}

/** A scene one param named, and how it named it, for disagreement errors */
interface SceneRef {
  scene: number;
  source: string;
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
 * Resolve what the target params name: one scene for play-scene, or session
 * positions ("t0/s1") for the clip actions. play-scene settles on a single
 * scene every param agrees on; the clip actions take their target from `ids`
 * or a path, and refusing both beats guessing which the caller meant.
 * @param action - The playback action, which decides whether a target applies
 * @param params - The raw target params
 * @param params.ids - Comma-separated clip IDs, or scene IDs for play-scene
 * @param params.path - A scene, or comma-separated session positions
 * @param params.slots - Deprecated comma-separated trackIndex/sceneIndex positions
 * @param params.sceneIndex - Scene index, an alternative to a "s<scene>" path
 * @returns What the params named, null where they named nothing
 */
export function resolvePlaybackTarget(
  action: string,
  { ids, path, slots, sceneIndex }: PlaybackTargetParams,
): PlaybackTarget {
  const namedIds = namedParam(ids, "ids");

  // Parsing these for an action that never reads them turns a leftover param
  // into a failed transport command: `stop` has to stop.
  if (!TARGETING_ACTIONS.has(action)) {
    warnUnusedTarget(action, { path, slots, ids: namedIds, sceneIndex });

    return { sceneIndex: null, slotPositions: null, ids: undefined };
  }

  const { source, ...target } = resolvePathTarget(path, slots);

  if (action === PLAY_SCENE) {
    assertScenePath(target.slotPositions, source);

    return {
      sceneIndex: resolveSceneTarget(target.sceneIndex, sceneIndex, namedIds),
      slotPositions: null,
      ids: undefined,
    };
  }

  // Both name what to act on, so refusing beats guessing which the caller meant.
  if (namedIds != null && source != null) {
    throw new Error(
      `playback failed: ids and ${source.label} are mutually exclusive`,
    );
  }

  assertClipPath(action, target.sceneIndex, source);

  if (sceneIndex != null) {
    console.warn(
      `sceneIndex ignored: action "${action}" acts on session positions; ` +
        `use action "${PLAY_SCENE}" for the whole scene`,
    );
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
 * Settle on the one scene to play. Every param that can name a scene gets a
 * vote: `path`, `sceneIndex`, and each id in `ids`. Only one scene plays at a
 * time, so params naming different scenes are refused rather than ranked —
 * picking a winner would silently drop half of what the caller asked for.
 * @param pathScene - The scene named by `path`, or null when it named none
 * @param sceneIndex - The `sceneIndex` param
 * @param ids - The normalized `ids` param
 * @returns The scene to play, or null when nothing named one
 */
function resolveSceneTarget(
  pathScene: number | null,
  sceneIndex: number | undefined,
  ids: string | undefined,
): number | null {
  const refs: SceneRef[] = [];

  if (pathScene != null) {
    refs.push({ scene: pathScene, source: `path "s${pathScene}"` });
  }

  if (sceneIndex != null) {
    refs.push({ scene: sceneIndex, source: `sceneIndex ${sceneIndex}` });
  }

  refs.push(...idSceneRefs(ids));

  // Keep the first param to name each scene, so the error names one source per
  // scene rather than repeating a scene the caller named two ways.
  const distinct = new Map<number, string>();

  for (const { scene, source } of refs) {
    if (!distinct.has(scene)) distinct.set(scene, source);
  }

  if (distinct.size > 1) {
    const named = [...distinct]
      .map(([scene, source]) => `scene ${scene} from ${source}`)
      .join(", ");

    throw new Error(
      `playback failed: action "${PLAY_SCENE}" plays one scene, but got ${named}`,
    );
  }

  return refs[0]?.scene ?? null;
}

/**
 * The scene each id names: a scene id names itself, and a session clip or clip
 * slot id names the scene it sits in. An id naming no scene is warned and
 * skipped, the way every other bad id in this tool is.
 * @param ids - The normalized `ids` param
 * @returns One ref per id that names a scene
 */
function idSceneRefs(ids: string | undefined): SceneRef[] {
  if (ids == null) return [];

  const refs: SceneRef[] = [];

  for (const id of parseCommaSeparatedIds(ids)) {
    const object = LiveAPI.from(id);

    if (!object.exists()) {
      console.warn(`playback: id "${id}" does not exist`);
      continue;
    }

    // Arrangement clips and everything off the session grid land here. Say
    // what would work, since "found Clip" alone reads as a contradiction to a
    // caller who was asked for a clip id.
    if (object.sceneIndex == null) {
      console.warn(
        `playback: id "${id}" is in no scene (found ${object.type}); ` +
          `action "${PLAY_SCENE}" takes a scene id or a session clip id`,
      );
      continue;
    }

    refs.push({ scene: object.sceneIndex, source: `ids "${id}"` });
  }

  return refs;
}

/**
 * Refuse a path that names session positions when the action plays one scene.
 * play-scene reads only the scene, so without this the path falls through to a
 * "you gave me nothing" error about the very param the caller did send.
 * @param slotPositions - The session positions the path named, or null
 * @param source - The param that named them, or null when none did
 */
function assertScenePath(
  slotPositions: SlotPosition[] | null,
  source: PathSource | null,
): void {
  if (source == null || slotPositions == null) return;

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

/**
 * Refuse a path that names a scene when the action acts on clips.
 * @param action - The playback action
 * @param sceneIndex - The scene the path named, or null
 * @param source - The param that named it, or null when none did
 */
function assertClipPath(
  action: string,
  sceneIndex: number | null,
  source: PathSource | null,
): void {
  if (source == null || sceneIndex == null) return;

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

/**
 * Warns for target params on an action that has no target to apply them to.
 * @param action - The playback action
 * @param params - The target params, with `ids` already normalized
 * @param params.path - Raw path param
 * @param params.slots - Raw deprecated slots param
 * @param params.ids - Normalized ids param
 * @param params.sceneIndex - Raw sceneIndex param
 */
function warnUnusedTarget(
  action: string,
  { path, slots, ids, sceneIndex }: PlaybackTargetParams,
): void {
  const sent = [
    namedParam(path, "path") != null ? "path" : null,
    namedHiddenPath(slots) != null ? "slots" : null,
    ids != null ? "ids" : null,
    sceneIndex != null ? "sceneIndex" : null,
  ].filter((param) => param != null);

  if (sent.length === 0) return;

  console.warn(`${sent.join("/")} ignored: action "${action}" takes no target`);
}
