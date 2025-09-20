import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefCaptureScene = defineTool("ppal-capture-scene", {
  title: "Capture Scene",
  description:
    "Captures currently playing Session clips from all tracks and inserts them as a new scene\nbelow the selected scene." +
    "IMPORTANT: This captures Session clips only (not Arrangement clips). " +
    "Tracks not playing a Session clip will have an empty clip slot in the captured scene. " +
    "WARNING: This operation puts ALL tracks into non-arrangement-following state, even tracks that aren't playing a Session clip - use the transport tool's followingTrackIndexes parameter to restore Arrangement playback if needed.",
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
      .describe("Optional scene index to select before capturing"),
    name: z
      .string()
      .optional()
      .describe("Optional name for the captured scene"),
  },
});
