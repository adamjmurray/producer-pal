// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type LaneLedger } from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import {
  landedColor,
  type LandedColor,
} from "#src/tools/shared/helpers/landed-color.ts";
import { arrangementPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  copyLengthBeats,
  createClipsForLength,
  parseArrangementLength,
} from "../clip/arrangement-length.ts";
import { refusedCopy } from "../clip/copy-entries.ts";
import {
  clearedBefore,
  copiedIds,
  copyClearingAsync,
  copyLedger,
  copyReach,
  mainLaneOf,
  noteCleared,
} from "../clip/overwrites/copy-overwrites.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "../minimal-clip-info.ts";
import {
  forEachClipInScene,
  readSceneClips,
  type ScenePass,
  sceneIndexOf,
} from "./scene-clips.ts";

/** What a scene copy reports. */
export interface SceneCopyEntry {
  id: string;
  path: string;
  /** The color Live settled on, when it isn't the one asked for */
  color?: string;
  clips: MinimalClipInfo[];
  detail?: string;
}

/** Where Live put a scene copy. */
interface LandedSceneCopy {
  /** The copy's index */
  index: number;
  /** What Live threw after the copy was made, if it did */
  threw?: string;
}

/**
 * Duplicate a scene and find where the copy landed, rather than assuming it is
 * right after its source.
 * @param sceneIndex - The scene to duplicate
 * @returns Where the copy is
 * @throws Error when Live made no new scene
 */
function landSceneCopy(sceneIndex: number): LandedSceneCopy {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const before = new Set(liveSet.getChildIds("scenes"));
  let threw: string | undefined;

  try {
    liveSet.call("duplicate_scene", sceneIndex);
  } catch (error) {
    threw = errorMessage(error);
  }

  // Nothing before the source moves, so only look after it.
  const made = liveSet
    .getChildIds("scenes")
    .findIndex((id, index) => index > sceneIndex && !before.has(id));

  if (made === -1) {
    const source = formatObjectPath({ kind: "scene", sceneIndex });

    throw new Error(threw ?? `Live made no copy of ${source}`);
  }

  return { index: made, ...(threw != null && { threw }) };
}

/**
 * Duplicate a scene
 * @param sceneIndex - Scene index to duplicate
 * @param name - Optional name for the duplicated scene
 * @param color - Optional color for the duplicated scene
 * @param withoutClips - Whether to exclude clips when duplicating
 * @returns Scene info object with id, path, and clips array, and a detail when
 *   something failed after the scene was made
 */
export function duplicateScene(
  sceneIndex: number,
  name?: string,
  color?: string,
  withoutClips?: boolean,
): SceneCopyEntry {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const { index: newSceneIndex, threw } = landSceneCopy(sceneIndex);
  const newScene = LiveAPI.from(livePath.scene(newSceneIndex));
  const duplicatedClips: MinimalClipInfo[] = [];
  let detail: string | undefined =
    threw == null ? undefined : `the scene was made, but Live said: ${threw}`;
  let landed: LandedColor = {};

  // The scene exists from here on, so a failure is on its entry: a throw would
  // report a skip for a scene that is there.
  try {
    if (name != null) {
      newScene.set("name", name);
    }

    if (color != null) {
      newScene.setColor(color);
      landed = landedColor(newScene, color);
    }

    // Get all duplicated clips in this scene
    const trackIds = liveSet.getChildIds("tracks");

    if (withoutClips === true) {
      // Delete all clips in the duplicated scene
      forEachClipInScene(newSceneIndex, trackIds, (_clip, clipSlot) => {
        clipSlot.call("delete_clip");
      });
    } else {
      // Default behavior: collect info about duplicated clips
      forEachClipInScene(newSceneIndex, trackIds, (clip) => {
        duplicatedClips.push(getMinimalClipInfo(clip));
      });
    }
  } catch (error) {
    detail = joinDetails([
      detail,
      `the scene was made, but ${errorMessage(error)}`,
    ]);
  }

  // Return optimistic metadata
  return {
    id: newScene.id,
    path: formatObjectPath({ kind: "scene", sceneIndex: newSceneIndex }),
    ...(landed.color != null && { color: landed.color }),
    clips: duplicatedClips,
    ...joinedDetail(detail, landed.detail),
  };
}

/**
 * The detail field of an entry, or nothing when there is none to say.
 * @param details - What the entry has to say
 * @returns A spread-ready object
 */
function joinedDetail(...details: Array<string | undefined>): {
  detail?: string;
} {
  const detail = joinDetails(details);

  return detail == null ? {} : { detail };
}

/**
 * Duplicate a scene to the arrangement view
 * @param sceneId - Scene ID to duplicate
 * @param arrangementStartBeats - Start position in beats
 * @param name - Optional name for the duplicated clips
 * @param color - Optional color for the duplicated clips
 * @param withoutClips - Whether to exclude clips when duplicating
 * @param arrangementLength - Optional length (<count>bar, n<fraction>, or <count>bar+n<fraction>)
 * @param songTimeSigNumerator - Song time signature numerator
 * @param songTimeSigDenominator - Song time signature denominator
 * @param context - Context object with silenceWavPath
 * @param ledger - The call's arrangement lanes, shared by every copy
 * @param read - The scene as the call already read it, to share the pass
 * @returns The clips the copy landed, each with its own path, and what it did
 *   on a track where it landed none or failed. A position where no clip landed
 *   and nothing was cleared is a skip.
 */
export async function duplicateSceneToArrangement(
  sceneId: string,
  arrangementStartBeats: number,
  name?: string,
  color?: string,
  withoutClips?: boolean,
  arrangementLength?: string,
  songTimeSigNumerator = 4,
  songTimeSigDenominator = 4,
  context: Partial<ToolContext & TilingContext> = {},
  ledger: LaneLedger = copyLedger(),
  read?: ScenePass,
): Promise<{ clips: MinimalClipInfo[]; detail?: string } | TargetSkip> {
  // A pass the caller holds already shows the scene is there.
  const sceneIndex = read?.sceneIndex ?? sceneIndexOf(sceneId);

  if (withoutClips === true) {
    return { clips: [] };
  }

  const { clips: sceneClips, length: ownLength } =
    read ?? readSceneClips(sceneIndex);
  // The length asked for, or the longest clip in the scene.
  const arrangementLengthBeats =
    arrangementLength == null
      ? ownLength
      : parseArrangementLength(
          arrangementLength,
          songTimeSigNumerator,
          songTimeSigDenominator,
        );

  // Nothing to copy is not a failure: the position is done.
  if (sceneClips.length === 0) {
    return { clips: [], detail: "the scene has no clips" };
  }

  const duplicatedClips: MinimalClipInfo[] = [];
  // Tracks that got no copy, and why.
  const declined: string[] = [];
  let clearedAny = false;

  for (const { clip, trackIndex } of sceneClips) {
    const track = LiveAPI.from(livePath.track(trackIndex));
    const { clips, cleared, failure } = await copyTrackClip(
      clip,
      trackIndex,
      track,
      arrangementStartBeats,
      arrangementLengthBeats,
      ledger,
      () =>
        createClipsForLength(
          clip,
          track,
          arrangementStartBeats,
          arrangementLengthBeats,
          songTimeSigNumerator,
          songTimeSigDenominator,
          name,
          context,
          color,
        ),
    );

    duplicatedClips.push(...clips);

    if (clips[0] != null) {
      if (cleared != null) {
        noteCleared(clips[0], cleared);
      }

      continue;
    }

    // A track with no copy has no entry to carry it, so the scene's does.
    const where = arrangementPath(trackIndex);
    const why =
      failure == null
        ? `Live made no copy on ${where}`
        : `on ${where}: ${failure}`;

    declined.push(cleared == null ? why : `${why}, but ${cleared}`);
    clearedAny ||= cleared != null;
  }

  const detail = joinDetails(declined);

  // Nothing landed and nothing changed: the position got nothing.
  if (duplicatedClips.length === 0 && !clearedAny) {
    return refusedCopy(
      { beats: arrangementStartBeats },
      { songTimeSigNumerator, songTimeSigDenominator },
      `no clip landed: ${detail}`,
    );
  }

  return { clips: duplicatedClips, ...(detail != null && { detail }) };
}

// --- Helpers below main exports ---

/**
 * Copies one track's clip of the scene, and reads what the copy cleared. A
 * throw is that track's failure, so the scene's other tracks still land.
 * @param clip - The scene's clip on this track
 * @param trackIndex - The track
 * @param track - The track object
 * @param startBeats - Where the copy begins
 * @param lengthBeats - How long the copy is
 * @param ledger - The call's arrangement lanes
 * @param write - Makes the copy
 * @returns The clips that landed, what they cleared, and why it failed if it did
 */
async function copyTrackClip(
  clip: LiveAPI,
  trackIndex: number,
  track: LiveAPI,
  startBeats: number,
  lengthBeats: number,
  ledger: LaneLedger,
  write: () => Promise<MinimalClipInfo[]>,
): Promise<{
  clips: MinimalClipInfo[];
  cleared?: string;
  failure?: string;
}> {
  try {
    // The result reports id and path only: a clip takes the name verbatim, so
    // reading it back could only repeat the arg.
    const { made, cleared } = await copyClearingAsync(
      ledger,
      mainLaneOf(trackIndex, track),
      copyReach(startBeats, copyLengthBeats(clip), lengthBeats),
      write,
      (clips) => clips.flatMap(copiedIds),
    );

    return { clips: made, ...(cleared != null && { cleared }) };
  } catch (error) {
    // What the failing copy cleared first stays with its failure.
    const cleared = clearedBefore(error);

    return {
      clips: [],
      failure: errorMessage(error),
      ...(cleared != null && { cleared }),
    };
  }
}
