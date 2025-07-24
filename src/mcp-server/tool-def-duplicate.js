// src/mcp-server/tool-def-duplicate.js
import { z } from "zod";
import { defineTool } from "./define-tool.js";
import {
  MAX_AUTO_CREATED_SCENES,
  MAX_AUTO_CREATED_TRACKS,
} from "../tools/constants.js";

export const toolDefDuplicate = defineTool("ppal-duplicate", {
  title: "Duplicate Clip/Track/Scene",
  description:
    "TIME FORMATS: Uses bar|beat for positions, bar:beat for durations. See create-clip for details. " +
    `Duplicates an object by id and type. Supports creating multiple duplicates with the count parameter. Subject to limits: maximum ${MAX_AUTO_CREATED_TRACKS} tracks and ${MAX_AUTO_CREATED_SCENES} scenes. When duplicating scenes or tracks, clips are duplicated by default but can be excluded with withoutClips:true. Use the duplicatedClips array in the response to identify which clip slots now contain clips that must be modified using update-clip rather than create-clip. ` +
    "IMPORTANT: For Arrangement clips, all timing is relative to each clip's start time, not the global arrangement timeline. " +
    "IMPORTANT: Session clips take precedence over Arrangement clips. Duplicated Arrangement clips will only play if their tracks are currently in arrangement-following state (see transport tool).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    type: z
      .enum(["track", "scene", "clip"])
      .describe("Type of object to duplicate"),
    id: z.string().describe("Object id to duplicate"),
    count: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Number of duplicates to create (default: 1)"),
    destination: z
      .enum(["session", "arrangement"])
      .optional()
      .describe(
        "Destination for clip or scene duplication. Required when type is 'clip'. For scenes, defaults to 'session'.",
      ),
    arrangementStartTime: z
      .string()
      .optional()
      .describe(
        "Arrangement view start time in bar|beat position format using pipe separator (e.g., '5|1' = bar 5, beat 1 of the arrangement). Required when destination is 'arrangement'.",
      ),
    arrangementLength: z
      .string()
      .optional()
      .describe(
        "Arrangement view duration in bar:beat duration format using colon separator (e.g., '4:0' = exactly 4 bars, '2:1.5' = 2 bars + 1.5 beats). When not provided, this defaults to the clip length, or the longest clip in the scene. Auto-duplicates looping clips to fill the specified duration.",
      ),
    name: z
      .string()
      .optional()
      .describe(
        "Optional name for the duplicated object(s) (auto-increments for count > 1)",
      ),
    withoutClips: z
      .boolean()
      .default(false)
      .describe(
        "Whether to exclude clips when duplicating tracks or scenes (default: false)",
      ),
    withoutDevices: z
      .boolean()
      .default(false)
      .describe(
        "Whether to exclude devices when duplicating tracks (default: false)",
      ),
    routeToSource: z
      .boolean()
      .optional()
      .describe(
        "Create a routing setup where the new track controls the source track's instrument. Effects: 1) New track has no clips or devices, 2) New track output routes to source track, 3) Source track is armed for input, 4) Source track input set to 'No Input' to prevent unwanted external input. WARNING: This changes the source track's input routing settings and arms the source track. IMPORTANT: If there are duplicate track names in your set, routeToSource may route to the wrong track. Maintain unique track names to avoid this issue.",
      ),
  },
});
