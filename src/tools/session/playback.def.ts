// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { deprecatedParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

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
play-session-clips: by id(s) or path(s)
stop-session-clips: by id(s) or path(s)
stop-all-session-clips: all
stop: session and arrangement`,
      ),
    startTime: z
      .string()
      .optional()
      .describe("bar|beat position in arrangement (song meter)"),
    startLocator: param(z.string().optional(), {
      default:
        "locator ID or name for start position (e.g., locator-0 or Verse)",
      smallModel: null,
    }),
    loop: z.boolean().optional().describe("arrangement loop?"),
    loopStart: z.string().optional().describe("bar|beat position (song meter)"),
    loopStartLocator: param(z.string().optional(), {
      default: "locator ID or name for loop start",
      smallModel: null,
    }),
    loopEnd: z.string().optional().describe("bar|beat position (song meter)"),
    loopEndLocator: param(z.string().optional(), {
      default: "locator ID or name for loop end",
      smallModel: null,
    }),
    ids: z.coerce
      .string()
      .optional()
      .describe(
        "comma-separated clip ID(s); for play-scene, a scene ID (or a clip ID in that scene)",
      ),
    path: z.coerce
      .string()
      .optional()
      .describe(
        "session position(s) 't<track>/s<scene>', both 0-based, comma-separated (e.g., 't0/s1' or 't0/s1,t2/s3'); " +
          "or one scene 's<scene>' for play-scene (e.g., 's3')",
      ),
    slots: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "path",
    }),
    sceneIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based scene index for play-scene (or use path 's<scene>')"),
  },
});
