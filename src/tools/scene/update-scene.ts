import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import {
  parseCommaSeparatedIds,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
} from "./scene-helpers.ts";

interface UpdateSceneResult {
  id: string;
}

interface UpdateSceneArgs {
  ids?: string;
  name?: string;
  color?: string;
  tempo?: number | null;
  timeSignature?: string | null;
}

/**
 * Updates properties of existing scenes
 * @param args - The scene parameters
 * @param args.ids - Comma-separated scene IDs to update
 * @param args.name - Name for the scenes
 * @param args.color - Color for the scenes (CSS format: hex)
 * @param args.tempo - Tempo in BPM. Pass -1 to disable.
 * @param args.timeSignature - Time signature in format "4/4". Pass "disabled" to disable.
 * @param _context - Internal context object (unused)
 * @returns Single scene object or array of scene objects
 */
export function updateScene(
  { ids, name, color, tempo, timeSignature }: UpdateSceneArgs = {},
  _context: Partial<ToolContext> = {},
): UpdateSceneResult | UpdateSceneResult[] {
  if (!ids) {
    throw new Error("updateScene failed: ids is required");
  }

  // Parse comma-separated string into array
  const sceneIds = parseCommaSeparatedIds(ids);

  // Validate all IDs are scenes, skip invalid ones
  const scenes = validateIdTypes(sceneIds, "scene", "updateScene", {
    skipInvalid: true,
  });

  const updatedScenes: UpdateSceneResult[] = [];

  for (const scene of scenes) {
    // Update properties if provided
    if (name != null) {
      scene.set("name", name);
    }

    if (color != null) {
      scene.setColor(color);
      verifyColorQuantization(scene, color);
    }

    applyTempoProperty(scene, tempo);
    applyTimeSignatureProperty(scene, timeSignature);

    // Build optimistic result object
    updatedScenes.push({
      id: scene.id,
    });
  }

  return unwrapSingleResult(updatedScenes);
}
