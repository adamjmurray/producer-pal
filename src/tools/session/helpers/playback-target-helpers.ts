// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  namedIdParam,
  namedParam,
  namedPathParam,
  targetEntries,
} from "#src/tools/shared/utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import {
  formatObjectPath,
  pathError,
  type ObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import {
  namedHiddenPath,
  parseObjectPathList,
  requireClipSlotPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  type ClipSlotPosition,
  parseSlotList,
} from "#src/tools/shared/validation/position-parsing.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

export interface PlaybackTarget {
  /** The one scene to play, agreed by every param that named one */
  sceneIndex: number | null;
  /** Clip slots named by `path` or the deprecated `slots` */
  slotPositions: ClipSlotPosition[] | null;
  /** `id` as the caller named it, or undefined when it names no clip */
  ids: string | undefined;
}

export interface PlaybackTargetParams {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
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
 * scene every param agrees on; the clip actions name a set, so `id` and a path
 * union.
 * @param action - The playback action, which decides whether a target applies
 * @param params - The raw target params
 * @param params.id - Comma-separated clip IDs, or scene IDs for play-scene
 * @param params.ids - Hidden alias for id
 * @param params.path - A scene, or comma-separated clip slots
 * @param params.paths - Hidden alias for path
 * @param params.slots - Deprecated comma-separated trackIndex/sceneIndex positions
 * @param params.sceneIndex - Scene index, an alternative to a "s<scene>" path
 * @returns What the params named, null where they named nothing
 */
export function resolvePlaybackTarget(
  action: string,
  { id, ids, path, paths, slots, sceneIndex }: PlaybackTargetParams,
): PlaybackTarget {
  const namedIds = namedIdParam(id, ids, "ids");
  const namedPaths = namedPathParam(path, paths);

  // Parsing these for an action that never reads them turns a leftover param
  // into a failed transport command: `stop` has to stop.
  if (!TARGETING_ACTIONS.has(action)) {
    warnUnusedTarget(action, {
      path: namedPaths,
      slots,
      ids: namedIds,
      sceneIndex,
    });

    return { sceneIndex: null, slotPositions: null, ids: undefined };
  }

  const { entries, source } = readPathParam(namedPaths, slots);

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

  // Narrow before warning: a path this action can't use throws, and saying we
  // ignored a param on a call that did nothing is noise the model has to read.
  const slotPositions = slotPositionsFrom(action, entries, source);

  if (sceneIndex != null) {
    console.warn(
      `sceneIndex ignored: action "${action}" acts on clip slots; ` +
        `use action "${PLAY_SCENE}" for the whole scene`,
    );
  }

  return { sceneIndex: null, slotPositions, ids: namedIds };
}

/**
 * Union the slots named by ids and by the resolved path positions. Both name a
 * set of clips to act on, so neither drops the other.
 * @param ids - Comma-separated clip IDs
 * @param slotPositions - Resolved clip slots, or null when none given
 * @param action - Action name for error messages
 * @returns The distinct slots to act on
 */
export function resolveClipSlotPositions(
  ids: string | undefined,
  slotPositions: ClipSlotPosition[] | null,
  action: string,
): ClipSlotPosition[] {
  if (ids == null && slotPositions == null) {
    throw new Error(
      `playback failed: id or path is required for action "${action}"`,
    );
  }

  const positions = dedupeSlotPositions([
    ...(ids == null ? [] : idSlotPositions(ids, action)),
    ...(slotPositions ?? []),
  ]);

  // Skipping a bad id among good ones still leaves a call to make. Skipping all
  // of them leaves none, and an empty list reads downstream as "act on these
  // zero clips" — so the tool fired nothing and reported playing: true. Each id
  // already warned why it was skipped; this says the call has no target left.
  if (positions.length === 0) {
    throw new Error(
      `playback failed: id "${ids}" named no clip for action "${action}"`,
    );
  }

  return positions;
}

// --- Helpers below main exports ---

/**
 * The slot each id names. A bad id is warned and skipped, not thrown: the
 * caller's other ids and paths still have a call to make.
 * @param ids - The normalized `id` param
 * @param action - Action name for error messages
 * @returns One position per id that named a session clip
 */
function idSlotPositions(ids: string, action: string): ClipSlotPosition[] {
  const clips = validateIdTypes(targetEntries(ids, "id"), "clip", "playback", {
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

/**
 * Drop slots named twice over. Naming the same clip by id and by path is not a
 * conflict, but firing it twice is a different Live call than firing it once.
 * @param positions - The slots every target param named, in order
 * @returns The distinct slots, first mention winning
 */
function dedupeSlotPositions(
  positions: ClipSlotPosition[],
): ClipSlotPosition[] {
  const seen = new Set<string>();

  return positions.filter(({ trackIndex, sceneIndex }) => {
    const key = `${trackIndex}/${sceneIndex}`;

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}

/**
 * Read `path` or the deprecated `slots` as parsed entries.
 * @param path - A scene, or comma-separated clip slots
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
 * The scene each path entry names. A clip slot names the scene it sits
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
        `or a clip slot "t<track>/s<scene>"`,
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
 * The clip slots each path entry names, for the actions that act on
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
): ClipSlotPosition[] | null {
  if (source == null) return null;

  return entries.map((entry) => {
    assertClipPath(action, entry, source);

    return requireClipSlotPath(entry, source.label);
  });
}

/**
 * Settle on the one scene to play. Every param that can name a scene gets a
 * vote: `path`, `sceneIndex`, and each id in `id`. Only one scene plays at a
 * time, so params naming different scenes are refused rather than ranked —
 * picking a winner would silently drop half of what the caller asked for.
 * @param pathRefs - The scenes the path param named, one per entry
 * @param sceneIndex - The `sceneIndex` param
 * @param ids - The normalized `id` param
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
 * @param ids - The normalized `id` param
 * @returns One ref per id that names a scene
 */
function idSceneRefs(ids: string | undefined): SceneRef[] {
  if (ids == null) return [];

  const refs: SceneRef[] = [];

  for (const id of targetEntries(ids, "id")) {
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
        `playback: ${targetLabel(object)} is in no scene (found ${object.type}); ` +
          `action "${PLAY_SCENE}" takes a scene id or a session clip id`,
      );
      continue;
    }

    refs.push({ scene: object.sceneIndex, source: `id "${id}"` });
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
    `names a scene; action "${action}" takes clip slots ` +
      `"t<track>/s<scene>" (e.g., "t0/s${entry.sceneIndex}")${wholeScene}`,
  );
}

/**
 * Warns for target params on an action that has no target to apply them to.
 * @param action - The playback action
 * @param params - The target params, with `id` already normalized
 * @param params.path - Raw path param
 * @param params.slots - Raw deprecated slots param
 * @param params.ids - Normalized id param
 * @param params.sceneIndex - Raw sceneIndex param
 */
function warnUnusedTarget(
  action: string,
  { path, slots, ids, sceneIndex }: PlaybackTargetParams,
): void {
  const sent = [
    namedParam(path, "path") != null ? "path" : null,
    namedHiddenPath(slots, "slots") != null ? "slots" : null,
    ids != null ? "id" : null,
    sceneIndex != null ? "sceneIndex" : null,
  ].filter((param) => param != null);

  if (sent.length === 0) return;

  console.warn(`${sent.join("/")} ignored: action "${action}" takes no target`);
}
