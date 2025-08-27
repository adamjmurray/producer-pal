import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefReadScene = defineTool("ppal-read-scene", {
  title: "Read Scene",
  description:
    "Read comprehensive information about a scene. When includeClips is true, returns clip objects with time-based properties in bar|beat format. " +
    "Understanding scene state helps determine which clips are currently playing and whether tracks are following the Arrangement timeline.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    sceneIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Scene index (0-based). This is also the clipSlotIndex of every clip in this scene. Can be omitted only if sceneId is provided.",
      ),
    sceneId: z
      .string()
      .optional()
      .describe(
        "Scene ID to directly access any scene. Either this or sceneIndex must be provided.",
      ),
    include: z
      .array(z.enum(["*", "clips", "notes"]))
      .default([])
      .describe(
        "Array of data to include in the response. Available options: " +
          "'*' (include all available options), " +
          "'clips' (include clip information), " +
          "'notes' (include notes data in clip objects). " +
          "Default: [] (no additional data included).",
      ),
  },
});
