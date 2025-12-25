import { z } from "zod";
import { defineTool } from "../shared/tool-framework/define-tool.js";

export const toolDefPlayback = defineTool("ppal-playback", {
  title: "Playback Controls",
  description: "Control playback of the arrangement and session scenes/clips",
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
        "play-session-clips",
        "stop-session-clips",
        "stop-all-session-clips",
        "stop",
      ])
      .describe(
        `play-arrangement: from startTime
update-arrangement: modify loop
play-scene: all clips in scene
play-session-clips: by id(s)
stop-session-clips: by id(s)
stop-all-session-clips: all
stop: session and arrangement`,
      ),
    startTime: z
      .string()
      .optional()
      .describe("bar|beat position in arrangement"),
    startCueId: z
      .string()
      .optional()
      .describe("cue ID for start position (e.g., cue-0)"),
    startCueName: z.string().optional().describe("cue name for start position"),
    loop: z.boolean().optional().describe("arrangement loop?"),
    loopStart: z.string().optional().describe("bar|beat position"),
    loopStartCueId: z
      .string()
      .optional()
      .describe("cue ID for loop start (e.g., cue-0)"),
    loopStartCueName: z.string().optional().describe("cue name for loop start"),
    loopEnd: z.string().optional().describe("bar|beat position"),
    loopEndCueId: z
      .string()
      .optional()
      .describe("cue ID for loop end (e.g., cue-1)"),
    loopEndCueName: z.string().optional().describe("cue name for loop end"),
    autoFollow: z
      .boolean()
      .optional()
      .default(true)
      .describe("tracks auto-follow arrangement?"),
    clipIds: z
      .string()
      .optional()
      .describe("comma-separated ID(s) for clip operations"),
    sceneIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based scene index for play-scene"),
    switchView: z
      .boolean()
      .optional()
      .default(false)
      .describe("auto-switch view?"),
  },
});
