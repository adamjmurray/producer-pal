// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { MAX_CODE_LENGTH } from "#src/tools/constants.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefCreateClip = defineTool("ppal-create-clip", {
  title: "Create Clip",
  description:
    "Create MIDI or audio clip(s).\n" +
    "Requires sceneIndex (session) and/or arrangementStart (arrangement).\n" +
    "For audio: use sampleFile (absolute path), otherwise omit sampleFile to create a MIDI clip. ",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    trackIndex: z.coerce.number().int().min(0).describe("0-based track index"),

    sceneIndex: z.coerce
      .string()
      .optional()
      .describe(
        "session clip scene index(es), comma-separated for multiple (e.g., '0' or '0,2,5')",
      ),

    arrangementStart: z.coerce
      .string()
      .optional()
      .describe(
        "arrangement clip bar|beat position(s), comma-separated for multiple (e.g., '1|1' or '1|1,2|1,3|3')",
      ),

    name: z
      .string()
      .optional()
      .describe(
        "clip name (comma-separated when creating multiple, indexed: session positions first, then arrangement)",
      ),

    color: z
      .string()
      .optional()
      .describe("#RRGGBB (comma-separated when creating multiple, cycles)"),

    timeSignature: z
      .string()
      .optional()
      .describe(`N/D (4/4), default: global time signature`),

    start: z
      .string()
      .optional()
      .describe("bar|beat position where loop/clip region begins"),

    length: z
      .string()
      .optional()
      .describe(
        "duration in bar:beat (e.g., '4:0'), default: next full bar after latest note",
      ),

    looping: z.boolean().optional().describe("enable looping for the clip"),

    firstStart: z
      .string()
      .optional()
      .describe(
        "bar|beat playback start (looping clips, when different from start)",
      ),

    notes: z
      .string()
      .optional()
      .describe(
        "MIDI in bar|beat notation: [bar|beat] [v0-127] [t<dur>] [p0-1] note(s) - MIDI clips only",
      ),

    transforms: z
      .string()
      .optional()
      .describe("transform expressions (parameter: expression per line)"),

    ...(process.env.ENABLE_CODE_EXEC === "true"
      ? {
          code: z
            .string()
            .max(MAX_CODE_LENGTH)
            .optional()
            .describe(
              "JS function body: receives (notes, context), returns notes array (see Skills for properties) - MIDI only",
            ),
        }
      : {}),

    sampleFile: z
      .string()
      .optional()
      .describe("absolute path to audio file - audio clips only"),

    auto: z
      .enum(["play-scene", "play-clip"])
      .optional()
      .describe("auto-play session clips (play-scene keeps scene in sync)"),

    focus: z
      .boolean()
      .optional()
      .default(false)
      .describe("select the created clip and show clip detail view"),
  },

  smallModelModeConfig: {
    excludeParams: ["transforms", "code", "firstStart", "auto", "focus"],
    descriptionOverrides: {
      sceneIndex: "session clip scene index",
      arrangementStart: "arrangement clip bar|beat position (e.g., '1|1')",
      name: "clip name",
      color: "#RRGGBB",
    },
  },
});
