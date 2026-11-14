// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  sceneClips,
  type SceneSlotClip,
} from "#src/tools/shared/clip/slot-contents/scene-slot-clips.ts";
import { type LaneLedger } from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
import { type ScratchClipContext } from "#src/tools/shared/arrangement/helpers/scratch-clips.ts";
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
  createClipForLength,
  parseArrangementLength,
} from "../clip/arrangement-length.ts";
import { refusedCopy } from "../clip/copy-entries.ts";
import {
  changedBefore,
  clearedBefore,
  copyClearingAsync,
  copyLedger,
  copyReach,
  mainLaneOf,
} from "../clip/overwrites/copy-overwrites.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
  noteCopyEffects,
} from "../minimal-clip-info.ts";
import { readSceneClips, type ScenePass, sceneIndexOf } from "./scene-clips.ts";

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

    // The copy holds a clip for every one the source had, return tracks too.
    const slots = sceneClips(newSceneIndex);

    if (withoutClips === true) {
      const failures = clearClips(slots, duplicatedClips);

      if (failures.length > 0) {
        detail = joinDetails([
          detail,
          `the scene was made, but ${failures.join("; ")}`,
        ]);
      }
    } else {
      for (const { clip } of slots) {
        duplicatedClips.push(getMinimalClipInfo(clip));
      }
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
 * Delete every clip of a new scene. A clip Live wouldn't delete is still
 * there, so it is listed as one of the scene's clips and the others go on.
 * @param slots - The scene's clips
 * @param left - Gets the entry of each clip that is still there
 * @returns What failed, one phrase per clip
 */
function clearClips(slots: SceneSlotClip[], left: MinimalClipInfo[]): string[] {
  const failures: string[] = [];

  for (const { clip, clipSlot, path } of slots) {
    try {
      clipSlot.call("delete_clip");
    } catch (error) {
      // A throw can still mean Live deleted it.
      if (LiveAPI.from(clip.id).exists()) {
        left.push(getMinimalClipInfo(clip));
        failures.push(
          `couldn't clear the clip at ${path}: ${errorMessage(error)}`,
        );
      }
    }
  }

  return failures;
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
 *   and nothing changed is a skip.
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
  context: Partial<ToolContext & ScratchClipContext> = {},
  ledger: LaneLedger = copyLedger(),
  read?: ScenePass,
): Promise<{ clips: MinimalClipInfo[]; detail?: string } | TargetSkip> {
  // A pass the caller holds already shows the scene is there.
  const sceneIndex = read?.sceneIndex ?? sceneIndexOf(sceneId);

  if (withoutClips === true) {
    return { clips: [] };
  }

  const {
    clips: regularClips,
    returnClips,
    length: ownLength,
  } = read ?? readSceneClips(sceneIndex);
  // They have no arrangement lane, so only the regular tracks' clips are copied.
  const leftOut = returnClipsLeftOut(returnClips);
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
  if (regularClips.length === 0) {
    return { clips: [], detail: noClipsToCopy(returnClips) };
  }

  const duplicatedClips: MinimalClipInfo[] = [];
  // Tracks that got no copy, and why.
  const declined: string[] = [];
  let changedAny = false;

  for (const { clip, trackIndex } of regularClips) {
    const track = LiveAPI.from(livePath.track(trackIndex));
    const { copy, cleared, changed, failure } = await copyTrackClip(
      clip,
      trackIndex,
      track,
      arrangementStartBeats,
      arrangementLengthBeats,
      ledger,
      () =>
        createClipForLength(
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

    if (copy != null) {
      duplicatedClips.push(copy);

      if (cleared != null) {
        noteCopyEffects(copy, cleared);
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
    changedAny ||= changed;
  }

  const detail = joinDetails(declined);

  // Nothing landed and nothing changed: the position got nothing.
  if (duplicatedClips.length === 0 && !changedAny) {
    return refusedCopy(
      { beats: arrangementStartBeats },
      { songTimeSigNumerator, songTimeSigDenominator },
      `no clip landed: ${detail}`,
    );
  }

  const said = joinDetails([detail, leftOut]);

  return { clips: duplicatedClips, ...(said != null && { detail: said }) };
}

// --- Helpers below main exports ---

/**
 * Why a scene copied to the arrangement had nothing to copy.
 * @param returnClips - Where the scene's return-track clips sit
 * @returns The detail
 */
function noClipsToCopy(returnClips: string[]): string {
  return returnClips.length === 0
    ? "the scene has no clips"
    : `the scene has no clips on regular tracks, and ${returnClipsLeftOut(returnClips)}`;
}

/**
 * What a copy to the arrangement says about the return-track clips it left out.
 * @param returnClips - Where the scene's return-track clips sit
 * @returns The detail, or undefined when the scene has none
 */
function returnClipsLeftOut(returnClips: string[]): string | undefined {
  if (returnClips.length === 0) {
    return undefined;
  }

  return returnClips.length === 1
    ? `the return-track clip at ${returnClips[0]} was not copied: the arrangement has no return-track clips`
    : `the ${returnClips.length} return-track clips (${returnClips.join(", ")}) were not copied: the arrangement has no return-track clips`;
}

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
 * @returns The copy if one landed, what it cleared, whether the Set changed,
 *   and why it failed if it did
 */
async function copyTrackClip(
  clip: LiveAPI,
  trackIndex: number,
  track: LiveAPI,
  startBeats: number,
  lengthBeats: number,
  ledger: LaneLedger,
  write: () => Promise<MinimalClipInfo | undefined>,
): Promise<{
  copy?: MinimalClipInfo;
  cleared?: string;
  /** Whether the copy changed the Set (cleared clips, wrote the lane) */
  changed: boolean;
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
      (copy) => (copy == null ? [] : [copy.id]),
    );

    return {
      ...(made != null && { copy: made }),
      changed: cleared != null,
      ...(cleared != null && { cleared }),
    };
  } catch (error) {
    // What the failing copy cleared first stays with its failure.
    const cleared = clearedBefore(error);

    return {
      failure: errorMessage(error),
      changed: changedBefore(error),
      ...(cleared != null && { cleared }),
    };
  }
}
