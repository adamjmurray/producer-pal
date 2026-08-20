// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { namedParam, parseCommaSeparatedIds } from "#src/tools/shared/utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import {
  formatObjectPath,
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

/**
 * What `path` or the deprecated `slots` named. They accept different spellings
 * but parse to the same kind of entry, so everything downstream narrows once.
 */
interface PathInput {
  entries: ObjectPath[];
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

  const { entries, source } = readPathParam(path, slots);

  if (action === PLAY_SCENE) {
    return {
      sceneIndex: resolveSceneTarget(
        pathSceneRefs(entries, source),
        sceneIndex,
        namedIds,
      ),
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

  // Narrow before warning: a path this action can't use throws, and saying we
  // ignored a param on a call that did nothing is noise the model has to read.
  const slotPositions = slotPositionsFrom(action, entries, source);

  if (sceneIndex != null) {
    console.warn(
      `sceneIndex ignored: action "${action}" acts on session positions; ` +
        `use action "${PLAY_SCENE}" for the whole scene`,
    );
  }

  return { sceneIndex: null, slotPositions, ids: namedIds };
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
 * Read `path` or the deprecated `slots` as parsed entries.
 * @param path - A scene, or comma-separated session positions
 * @param slots - Deprecated comma-separated trackIndex/sceneIndex positions
 * @returns The entries named and which param named them, or nothing when
 *   neither did
 */
function readPathParam(
  path: string | undefined,
  slots: string | undefined,
): PathInput {
  const named = namedParam(path, "path");
  const legacy = namedHiddenPath(slots, "slots");

  if (named != null && legacy != null) {
    throw new Error(
      "playback failed: path and slots both name clips; use path alone (slots is deprecated)",
    );
  }

  if (named != null) {
    return {
      entries: parseObjectPathList(named, "path"),
      source: { label: "path", input: named },
    };
  }

  if (legacy == null) return { entries: [], source: null };

  return {
    entries: parseSlotList(legacy, "slots").map(
      ({ trackIndex, sceneIndex }) => ({
        kind: "slot" as const,
        trackIndex,
        sceneIndex,
      }),
    ),
    source: { label: "slots", input: legacy },
  };
}

/**
 * The scene each path entry names. A session position names the scene it sits
 * in: play-scene fires the whole scene whatever track the path sits on, so the
 * track is surplus, not a contradiction, and dropping it beats refusing a
 * caller who already told us the scene.
 * @param entries - What the path param named
 * @param source - The param that named them, or null when neither did
 * @returns One ref per entry
 */
function pathSceneRefs(
  entries: ObjectPath[],
  source: PathSource | null,
): SceneRef[] {
  if (source == null) return [];

  return entries.map((entry) => {
    if (entry.kind === "scene" || entry.kind === "slot") {
      return { scene: entry.sceneIndex, source: quoteEntry(entry, source) };
    }

    // Every other shape is missing the scene rather than carrying a spare one,
    // so there is nothing to recover.
    throw pathError(
      source.label,
      formatObjectPath(entry),
      `names no scene; action "${PLAY_SCENE}" takes a scene "s<scene>" ` +
        `or a session position "t<track>/s<scene>"`,
    );
  });
}

/**
 * Name one entry the way the param that carried it is written. The deprecated
 * `slots` rejects path spelling, so quoting `t0/s1` back at a `slots` caller
 * hands them a value that param won't take.
 * @param entry - One entry the path param named
 * @param source - The param that named it
 * @returns The param and the entry, quoted (e.g. `path "t0/s1"`)
 */
function quoteEntry(entry: ObjectPath, source: PathSource): string {
  const spelled =
    source.label === "slots" && entry.kind === "slot"
      ? `${entry.trackIndex}/${entry.sceneIndex}`
      : formatObjectPath(entry);

  return `${source.label} "${spelled}"`;
}

/**
 * The session positions each path entry names, for the actions that act on
 * clips rather than a whole scene.
 * @param action - The playback action
 * @param entries - What the path param named
 * @param source - The param that named them, or null when neither did
 * @returns One position per entry, or null when the param named nothing
 */
function slotPositionsFrom(
  action: string,
  entries: ObjectPath[],
  source: PathSource | null,
): SlotPosition[] | null {
  if (source == null) return null;

  return entries.map((entry) => {
    assertClipPath(action, entry, source);

    return requireSessionSlot(entry, source.label);
  });
}

/**
 * Settle on the one scene to play. Every param that can name a scene gets a
 * vote: `path`, `sceneIndex`, and each id in `ids`. Only one scene plays at a
 * time, so params naming different scenes are refused rather than ranked —
 * picking a winner would silently drop half of what the caller asked for.
 * @param pathRefs - The scenes the path param named, one per entry
 * @param sceneIndex - The `sceneIndex` param
 * @param ids - The normalized `ids` param
 * @returns The scene to play, or null when nothing named one
 */
function resolveSceneTarget(
  pathRefs: SceneRef[],
  sceneIndex: number | undefined,
  ids: string | undefined,
): number | null {
  const refs: SceneRef[] = [...pathRefs];

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
 * Refuse a path entry that names a scene when the action acts on clips. The
 * reverse of the play-scene recovery: a scene is missing the track, so there is
 * nothing to drop, and firing clips one at a time isn't what launching a scene
 * does anyway.
 * @param action - The playback action
 * @param entry - One entry the path param named
 * @param source - The param that named it
 */
function assertClipPath(
  action: string,
  entry: ObjectPath,
  source: PathSource,
): void {
  if (entry.kind !== "scene") return;

  const wholeScene =
    action === "play-session-clips"
      ? `, or use action "${PLAY_SCENE}" for the whole scene`
      : "";

  throw pathError(
    source.label,
    formatObjectPath(entry),
    `names a scene; action "${action}" takes session positions ` +
      `"t<track>/s<scene>" (e.g., "t0/s${entry.sceneIndex}")${wholeScene}`,
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
    namedHiddenPath(slots, "slots") != null ? "slots" : null,
    ids != null ? "ids" : null,
    sceneIndex != null ? "sceneIndex" : null,
  ].filter((param) => param != null);

  if (sent.length === 0) return;

  console.warn(`${sent.join("/")} ignored: action "${action}" takes no target`);
}
