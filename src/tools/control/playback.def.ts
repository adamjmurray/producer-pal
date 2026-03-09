// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefPlayback = defineTool("ppal-playback", {
  title: "Playback",
  description: "Control playback of the arrangement and session scenes/clips.",

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
play-session-clips: by id(s) or slot(s)
stop-session-clips: by id(s) or slot(s)
stop-all-session-clips: all
stop: session and arrangement`,
      ),
    startTime: z
      .string()
      .optional()
      .describe("bar|beat position in arrangement"),
    startLocator: z
      .string()
      .optional()
      .describe(
        "locator ID or name for start position (e.g., locator-0 or Verse)",
      ),
    loop: z.boolean().optional().describe("arrangement loop?"),
    loopStart: z.string().optional().describe("bar|beat position"),
    loopStartLocator: z
      .string()
      .optional()
      .describe("locator ID or name for loop start"),
    loopEnd: z.string().optional().describe("bar|beat position"),
    loopEndLocator: z
      .string()
      .optional()
      .describe("locator ID or name for loop end"),
    ids: z.coerce
      .string()
      .optional()
      .describe("comma-separated ID(s) for clip operations"),
    slots: z
      .string()
      .optional()
      .describe(
        "session clip slot(s), trackIndex/sceneIndex format, comma-separated (e.g., '0/1' or '0/1,2/3')",
      ),
    sceneIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based scene index for play-scene"),
  },

  smallModelModeConfig: {
    excludeParams: ["startLocator", "loopStartLocator", "loopEndLocator"],
  },
});
