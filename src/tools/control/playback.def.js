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
    loop: z.boolean().optional().describe("arrangement loop?"),
    loopStart: z.string().optional().describe("bar|beat position"),
    loopEnd: z.string().optional().describe("bar|beat position"),
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
