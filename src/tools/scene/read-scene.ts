import { readClip } from "#src/tools/clip/read/read-clip.ts";
import {
  parseIncludeArray,
  READ_SCENE_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";

interface ReadSceneArgs {
  sceneIndex?: number;
  sceneId?: string;
  include?: string[];
}

interface ReadSceneResult {
  id: string | null;
  name: string | null;
  sceneIndex?: number | null;
  color?: string | null;
  tempo?: unknown;
  timeSignature?: string | null;
  triggered?: boolean;
  clips?: object[];
  clipCount?: number;
}

interface ClipResult {
  id?: string | null;
}

/**
 * Read comprehensive information about a scene
 * @param args - The parameters
 * @param args.sceneIndex - Scene index (0-based)
 * @param args.sceneId - Scene ID to directly access any scene
 * @param args.include - Array of data to include
 * @param _context - Internal context object (unused)
 * @returns Result object with scene information
 */
export function readScene(
  args: ReadSceneArgs = {},
  _context: Partial<ToolContext> = {},
): ReadSceneResult {
  const { sceneIndex, sceneId } = args;

  // Validate parameters
  if (sceneId == null && sceneIndex == null) {
    throw new Error("Either sceneId or sceneIndex must be provided");
  }

  const { includeClips, includeColor } = parseIncludeArray(
    args.include,
    READ_SCENE_DEFAULTS,
  );
  const liveSet = LiveAPI.from(`live_set`);

  let scene: LiveAPI;
  let resolvedSceneIndex: number | null | undefined = sceneIndex;

  if (sceneId != null) {
    // Use sceneId to access scene directly and validate it's a scene
    scene = validateIdType(sceneId, "scene", "readScene");

    // Determine scene index from the scene's path
    resolvedSceneIndex = scene.sceneIndex;
  } else {
    scene = LiveAPI.from(`live_set scenes ${sceneIndex}`);
  }

  if (!scene.exists()) {
    return {
      id: null,
      name: null,
      sceneIndex: resolvedSceneIndex,
    };
  }

  const isTempoEnabled = (scene.getProperty("tempo_enabled") as number) > 0;
  const isTimeSignatureEnabled =
    (scene.getProperty("time_signature_enabled") as number) > 0;

  const sceneName = scene.getProperty("name") as string | null;
  // resolvedSceneIndex is guaranteed to be a number at this point (either from sceneIndex param or scene.sceneIndex)
  const sceneNum = resolvedSceneIndex as number;
  const result: ReadSceneResult = {
    id: scene.id,
    name: sceneName ? `${sceneName} (${sceneNum + 1})` : `${sceneNum + 1}`,
    sceneIndex: resolvedSceneIndex,
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
    result.clips = liveSet
      .getChildIds("tracks")
      .map((_trackId, trackIndex) =>
        readClip({
          trackIndex,
          sceneIndex: resolvedSceneIndex,
          include: args.include,
        }),
      )
      .filter((clip: ClipResult) => clip.id != null);
  } else {
    // When not including full clip details, just return the count
    result.clipCount = liveSet
      .getChildIds("tracks")
      .map((_trackId, trackIndex) =>
        readClip({
          trackIndex,
          sceneIndex: resolvedSceneIndex,
          include: [],
        }),
      )
      .filter((clip: ClipResult) => clip.id != null).length;
  }

  return result;
}
