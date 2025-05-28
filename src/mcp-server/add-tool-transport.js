// src/mcp-server/add-tool-transport.js
import { z } from "zod";

export function addToolTransport(server, callLiveApi) {
  server.tool(
    "transport",
    "Controls the Arranger and Session view transport, including playback, position, and loop settings",
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
- "play-arrangement": Start arrangement playback from specified position (also starts playback in Session view for non-following tracks)
- "update-arrangement": Modify arrangement loop and follow settings without affecting playback state
- "play-scene": Launch all clips in a Session view scene (requires sceneIndex)
- "play-session-clip": Trigger clips in Session view (requires trackIndexes and clipSlotIndexes)
- "stop-track-session-clip": Stop Session view clips playing in specific tracks (requires trackIndexes)
- "stop-all-session-clips": Stop all Session view clips in all tracks
- "stop": Stop all playback: stop the transport, stop arrangement playback, stop session playback (but currently playing clips in Session view will retain their playing state and start playing again when the transport is started)`
        ),
      startTime: z
        .string()
        .optional()
        .describe(
          "Arrangement position in bar:beat format to start playback from (only used when action is 'play-arrangement'). Format is 'bar:beat' where bar and beat are 1-based. '1:1' = first beat of first bar. Uses song's time signature."
        ),
      loop: z.boolean().optional().describe("Enable/disable Arrangement loop"),
      loopStart: z
        .string()
        .optional()
        .describe(
          "Loop start position in bar:beat format. Format is 'bar:beat' where bar and beat are 1-based. '1:1' = first beat of first bar. Uses song's time signature."
        ),
      loopEnd: z
        .string()
        .optional()
        .describe(
          "Loop end position in bar:beat format. Format is 'bar:beat' where bar and beat are 1-based. For an N-bar clip, the end position is (startBar+N):startBeat. Uses song's time signature."
        ),
      followingTrackIndexes: z
        .string()
        .optional()
        .describe("Comma-separated list of track indexes (0-based) that should follow the Arranger."),
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
