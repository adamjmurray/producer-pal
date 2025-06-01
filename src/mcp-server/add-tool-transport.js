// src/mcp-server/add-tool-transport.js
import { z } from "zod";

export function addToolTransport(server, callLiveApi) {
  server.tool(
    "transport",
    "Controls the Arrangement and Session view transport, including playback, position, and loop settings. " +
      "IMPORTANT: Tracks can only play one clip at a time. Session clips take precedence over Arrangement clips. " +
      "When Session clips are launched, those tracks stop following the Arrangement until explicitly told to return.",
    {
      action: z
        .enum([
          "play-arrangement",
          "update-arrangement",
          "play-scene",
          "play-session-clip",
          "stop-track-session-clip",
          "stop-all-session-clips",
          "stop",
        ])
        .describe(
          `Transport action to perform:
- "play-arrangement": Start Arrangement timeline playback from specified position. Tracks currently playing Session clips will continue playing them unless specified in followingTrackIndexes
- "update-arrangement": Modify arrangement loop and follow settings without affecting playback state
- "play-scene": Launch all clips in a Session view scene (requires sceneIndex) - puts ALL tracks into non-following state, even tracks with empty clip slots in that scene
- "play-session-clip": Trigger clips in Session view (requires trackIndexes and clipSlotIndexes) - puts these tracks into non-following state
- "stop-track-session-clip": Stop Session view clips playing in specific tracks (tracks remain in non-following state)
- "stop-all-session-clips": Stop all Session view clips in all tracks (tracks remain in non-following state)
- "stop": Stop all playback: stop the transport, stop arrangement playback, stop session playback (but currently playing clips in Session view will retain their playing state and start playing again when the transport is started)`
        ),
      startTime: z
        .string()
        .optional()
        .describe(
          "Arrangement start time in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the arrangement). Uses song's time signature."
        ),
      loop: z.boolean().optional().describe("Enable/disable Arrangement loop"),
      loopStart: z
        .string()
        .optional()
        .describe(
          "Arrangement loop start in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the arrangement). Uses song's time signature."
        ),
      loopEnd: z
        .string()
        .optional()
        .describe(
          "Arrangement loop end in bar|beat position format using pipe separator (e.g., '5|1' = first beat of fifth bar of the arrangement). Uses song's time signature."
        ),
      followingTrackIndexes: z
        .string()
        .optional()
        .describe(
          "Comma-separated list of track indexes (0-based) that should return to following the Arrangement timeline (like clicking their 'Back to Arrangement' buttons). Use when tracks are playing Session clips but you want them to switch back to playing Arrangement clips."
        ),
      trackIndexes: z.string().optional().describe("Comma-separated list of track indexes (0-based)"),
      clipSlotIndexes: z
        .string()
        .optional()
        .describe(
          "Comma-separated list of clip slot indexes (0-based). If fewer indexes than trackIndexes, the last clipSlotIndex will be reused."
        ),
      sceneIndex: z.number().int().min(0).optional().describe("Scene index (0-based), required for play-scene"),
    },
    async (args) => callLiveApi("transport", args)
  );
}
