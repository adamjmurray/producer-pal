import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefPlayback = defineTool("ppal-playback", {
  title: "Playback Controls",
  description:
    "Controls the Arrangement and Session transport, including playback, position, and loop settings.\n" +
    "TIME FORMATS: Uses bar|beat for positions, bar:beat for durations. See create-clip for details. " +
    "IMPORTANT: Tracks can only play one clip at a time. Session clips take precedence over Arrangement clips. " +
    "When Session clips are launched, those tracks stop following the Arrangement until explicitly told to return.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
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
- "play-arrangement": Start Arrangement timeline playback from specified position. Tracks currently playing Session clips will stop playing them unless autoFollow is set to false. Consider using ppal-select to switch to Arrangement view if the user would benefit from seeing the arrangement.
- "update-arrangement": Modify arrangement loop and follow settings without affecting playback state
- "play-scene": Launch all clips in a Session scene (requires sceneId) - puts ALL tracks into non-following state, even tracks with empty clip slots in that scene. Consider using ppal-select to switch to Session view unless the user is actively working in Arrangement view.
- "play-session-clip": Trigger clips in Session (requires clipIds) - puts these tracks into non-following state
- "stop-track-session-clip": Stop Session clips playing in specific tracks (requires clipIds) - tracks remain in non-following state
- "stop-all-session-clips": Stop all Session clips in all tracks (tracks remain in non-following state)
- "stop": Stop all playback: stop the transport, stop arrangement playback, stop session playback (but currently playing clips in Session view will retain their playing state and start playing again when the transport is started)`,
      ),
    startTime: z
      .string()
      .optional()
      .describe(
        "Arrangement start time in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the arrangement). Uses song's time signature.",
      ),
    loop: z.boolean().optional().describe("Enable/disable Arrangement loop"),
    loopStart: z
      .string()
      .optional()
      .describe(
        "Arrangement loop start in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the arrangement). Uses song's time signature.",
      ),
    loopEnd: z
      .string()
      .optional()
      .describe(
        "Arrangement loop end in bar|beat position format using pipe separator (e.g., '5|1' = first beat of fifth bar of the arrangement). Uses song's time signature.",
      ),
    autoFollow: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "For 'play-arrangement' action: when true (default), all tracks automatically follow the arrangement timeline. When false, tracks maintain their current following state.",
      ),
    clipIds: z
      .string()
      .optional()
      .describe("Comma-separated list of clip IDs for Session view operations"),
    sceneId: z
      .string()
      .optional()
      .describe("Scene ID, required for play-scene"),
  },
});
