import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefCreateScene = defineTool("ppal-create-scene", {
  title: "Create Scene",
  description:
    "Creates new scenes at the specified index.\n" +
    "Scenes will be inserted at the given index and existing scenes will shift down. " +
    "Note: This only creates scene objects - use the transport tool's play-scene action to launch scenes and trigger their clips. " +
    "All properties are optional except sceneIndex.\n\n" +
    "When capture=true: Captures currently playing Session clips from all tracks and inserts them as a new scene below the selected scene. " +
    "IMPORTANT: This captures Session clips only (not Arrangement clips). " +
    "Tracks not playing a Session clip will have an empty clip slot in the captured scene. " +
    "WARNING: This operation puts ALL tracks into non-arrangement-following state, even tracks that aren't playing a Session clip - use the update-track tool's arrangementFollower parameter to restore individual tracks to Arrangement playback if needed.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    sceneIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Scene index (0-based) where to insert new scenes. Required when capture=false, optional when capture=true",
      ),
    count: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Number of scenes to create (default: 1)"),
    capture: z
      .boolean()
      .default(false)
      .describe(
        "Capture currently playing Session clips instead of creating empty scenes",
      ),
    name: z
      .string()
      .optional()
      .describe("Base name for the scenes (auto-increments for count > 1)"),
    color: z.string().optional().describe("Color in #RRGGBB hex format"),
    tempo: z
      .number()
      .optional()
      .describe(
        "Tempo in BPM for the scenes. Pass -1 to disable the scene's tempo.",
      ),
    timeSignature: z
      .string()
      .optional()
      .describe(
        'Time signature in format "n/m" (e.g. "4/4"). Pass "disabled" to disable the scene\'s time signature.',
      ),
  },
});
