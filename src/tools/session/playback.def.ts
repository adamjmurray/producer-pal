// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import {
  aliasParam,
  deprecatedParam,
} from "#src/tools/shared/tool-framework/hidden-param.ts";

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
        `play-arrangement: from startTime, or from wherever it already is
update-arrangement: set startTime and/or loop, without playing
play-scene: all clips in scene
play-session-clips: by id(s) or path(s)
stop-session-clips: by id(s) or path(s)
stop-all-session-clips: all
stop: session and arrangement; takes startTime to park the next play`,
      ),
    startTime: z
      .string()
      .optional()
      .describe(
        "where arrangement playback starts, and restarts from if it's already " +
          "playing. Stays put until something changes it: bar|beat in song " +
          "meter, or loc:<locator name or id> (e.g. '5|1' or 'loc:Verse')",
      ),
    startLocator: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "startTime",
    }),
    loop: z.boolean().optional().describe("arrangement loop?"),
    loopStart: z
      .string()
      .optional()
      .describe("bar|beat (song meter) or loc:<locator>; turns the loop on"),
    loopStartLocator: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "loopStart",
    }),
    loopEnd: z
      .string()
      .optional()
      .describe("bar|beat (song meter) or loc:<locator>; turns the loop on"),
    loopEndLocator: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "loopEnd",
    }),
    id: z.coerce
      .string()
      .optional()
      .describe(
        "clip ID(s), comma-separated for multiple; for play-scene, a scene ID (or a clip ID in that scene)",
      ),

    ids: aliasParam(z.coerce.string().optional(), {
      canonical: "id",
    }),
    path: z.coerce
      .string()
      .optional()
      .describe(
        "clip slot(s) 't<track>/s<scene>', both 0-based, comma-separated (e.g., 't0/s1' or 't0/s1,t2/s3'); " +
          "for play-scene, a scene 's<scene>' (e.g., 's3') or any position in it",
      ),
    paths: aliasParam(z.coerce.string().optional(), { canonical: "path" }),

    slots: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "path",
    }),
    sceneIndex: deprecatedParam(z.coerce.number().int().min(0).optional(), {
      replacedBy: "path",
    }),
  },
});
