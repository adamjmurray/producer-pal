// src/mcp-server/add-tool-duplicate.js
import { z } from "zod";
import {
  MAX_AUTO_CREATED_SCENES,
  MAX_AUTO_CREATED_TRACKS,
} from "../tools/constants.js";

export function addToolDuplicate(server, callLiveApi) {
  server.registerTool(
    "duplicate",
    {
      title: "Duplicate Clip/Track/Scene in Ableton Live",
      description:
        `Duplicates an object by id and type. Supports creating multiple duplicates with the count parameter. Subject to limits: maximum ${MAX_AUTO_CREATED_TRACKS} tracks and ${MAX_AUTO_CREATED_SCENES} scenes. When duplicating scenes or tracks, clips are duplicated by default but can be excluded with includeClips:false. Use the duplicatedClips array in the response to identify which clip slots now contain clips that must be modified using update-clip rather than create-clip. ` +
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
        includeClips: z
          .boolean()
          .optional()
          .describe(
            "Whether to include clips when duplicating tracks or scenes (default: true)",
          ),
      },
    },
    async (args) => callLiveApi("duplicate", args),
  );
}
