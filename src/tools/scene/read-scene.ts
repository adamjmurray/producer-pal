// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type Notation } from "#src/shared/notation.ts";
import {
  readClip,
  type ReadClipResult,
} from "#src/tools/clip/read/read-clip.ts";
import { sceneDisplayName } from "#src/tools/scene/scene-helpers.ts";
import {
  parseIncludeArray,
  READ_SCENE_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import {
  namedIdParam,
  namedParam,
  stripFields,
} from "#src/tools/shared/utils.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { sceneApiAtPath } from "#src/tools/shared/validation/path-target-lookup.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

interface ReadSceneArgs {
  sceneIndex?: number;
  id?: string;
  path?: string;
  /** Hidden alias for id */
  sceneId?: string;
  include?: string[];
  /**
   * Clips in this scene, when the caller already knows. A Live Set read counts
   * every clip slot for its tracks anyway, and counting again here would
   * build the whole grid a second time.
   */
  clipCount?: number;
}

interface ReadSceneResult {
  id: string | null;
  path?: string;
  name: string | null;
  color?: string | null;
  tempo?: unknown;
  timeSignature?: string | null;
  triggered?: boolean;
  clips?: object[];
  clipCount?: number;
}

/**
 * A clip as a scene read returns it. The track name is not in the clip's path
 * ("t0/s3" says which track, not which one it is), so a caller asking what a
 * scene holds would need a second read to learn what plays what.
 */
type SceneClip = ReadClipResult & { trackName?: string };

/**
 * Read comprehensive information about a scene
 * @param args - The parameters
 * @param args.sceneIndex - Scene index (0-based)
 * @param args.id - Scene ID to directly access any scene
 * @param args.path - Scene path to read instead of an id (e.g. "s3")
 * @param args.include - Array of data to include
 * @param args.clipCount - Clips in this scene, when the caller already counted them
 * @param context - Internal context object (supplies the active notation)
 * @returns Result object with scene information
 */
export function readScene(
  args: ReadSceneArgs = {},
  context: Partial<ToolContext> = {},
): ReadSceneResult {
  const { sceneIndex } = args;
  const sceneId = namedIdParam(args.id, args.sceneId, "sceneId");
  const scenePath = namedParam(args.path, "path");

  // Validate parameters
  if (sceneId == null && scenePath == null && sceneIndex == null) {
    throw new Error("readScene failed: id or path is required");
  }

  if (scenePath != null && (sceneId != null || sceneIndex != null)) {
    throw new Error(
      "readScene: path names the scene on its own - don't send id or sceneIndex with it",
    );
  }

  const { includeClips, includeColor } = parseIncludeArray(
    args.include,
    READ_SCENE_DEFAULTS,
  );
  const liveSet = LiveAPI.from(livePath.liveSet);

  let scene: LiveAPI;
  let resolvedSceneIndex: number | null | undefined = sceneIndex;

  if (sceneId != null || scenePath != null) {
    // Validate an id names a scene; a path says so by its own spelling
    scene =
      sceneId != null
        ? validateIdType(sceneId, "scene", "readScene")
        : sceneApiAtPath(scenePath as string, "readScene");

    // Determine scene index from the scene's Live path
    resolvedSceneIndex = scene.sceneIndex;
  } else {
    // sceneIndex guaranteed defined here: null-check at function start covers the id==null case
    scene = LiveAPI.from(livePath.scene(sceneIndex as number));
  }

  if (!scene.exists()) {
    throw new Error(`readScene: sceneIndex ${sceneIndex} does not exist`);
  }

  const isTempoEnabled = (scene.getProperty("tempo_enabled") as number) > 0;
  const isTimeSignatureEnabled =
    (scene.getProperty("time_signature_enabled") as number) > 0;

  const result: ReadSceneResult = {
    id: scene.id,
    ...pathField(scene),
    name: sceneDisplayName(scene, resolvedSceneIndex as number),
    ...(includeColor && { color: scene.getColor() }),
  };

  // Only include tempo/timeSignature when enabled
  if (isTempoEnabled) {
    result.tempo = scene.getProperty("tempo");
  }

  if (isTimeSignatureEnabled) {
    result.timeSignature = scene.timeSignature;
  }

  // Only include triggered when scene is triggered
  const isTriggered = (scene.getProperty("is_triggered") as number) > 0;

  if (isTriggered) {
    result.triggered = true;
  }

  if (includeClips) {
    const clips = readSceneClips(
      liveSet,
      resolvedSceneIndex,
      args.include,
      context.notation,
    );

    // Strip fields redundant with parent scene context
    stripFields(clips, "view");

    result.clips = clips;
  } else {
    // Lightweight clip counting — only check existence instead of reading full clip properties
    result.clipCount =
      args.clipCount ?? countSceneClips(liveSet, resolvedSceneIndex as number);
  }

  return result;
}

/**
 * Read every clip in a scene, one per track, naming the track each sits on.
 * @param liveSet - LiveAPI reference to the live set
 * @param sceneIndex - Scene index (0-based)
 * @param include - Include array for the nested clip reads
 * @param notation - Active notation for nested clip note formatting
 * @returns The scene's clips, skipping empty slots
 */
function readSceneClips(
  liveSet: LiveAPI,
  sceneIndex: number | null | undefined,
  include?: string[],
  notation?: Notation,
): SceneClip[] {
  const clips: SceneClip[] = [];

  for (const [trackIndex] of liveSet.getChildIds("tracks").entries()) {
    const clip: SceneClip = readClip(
      {
        trackIndex,
        sceneIndex,
        suppressEmptyWarning: true,
        slotValidated: true,
        include,
      },
      { notation },
    );

    if (clip.id == null) continue;

    // Only for slots that hold something — an empty grid would otherwise pay
    // for a track build per column it has no clip in.
    clip.trackName = LiveAPI.from(livePath.track(trackIndex)).getProperty(
      "name",
    ) as string;

    clips.push(clip);
  }

  return clips;
}

/**
 * Count non-empty clips in a scene using lightweight existence checks
 * @param liveSet - LiveAPI reference to the live set
 * @param sceneIndex - Scene index (0-based)
 * @returns Number of non-empty clips
 */
function countSceneClips(liveSet: LiveAPI, sceneIndex: number): number {
  let count = 0;

  for (const [trackIndex] of liveSet.getChildIds("tracks").entries()) {
    const clip = LiveAPI.from(
      livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
    );

    if (clip.exists()) {
      count++;
    }
  }

  return count;
}
