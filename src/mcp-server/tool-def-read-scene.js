// src/mcp-server/tool-def-read-scene.js
import { z } from "zod";
import { defineTool } from "./define-tool.js";

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
      .describe(
        "Scene index (0-based). This is also the clipSlotIndex of every clip in this scene.",
      ),
    include: z
      .array(z.enum(["clips"]))
      .default([])
      .describe(
        "Array of data to include in the response. Available options: " +
          "'clips' (include clip information). " +
          "Default: [] (no additional data included).",
      ),
  },
});
