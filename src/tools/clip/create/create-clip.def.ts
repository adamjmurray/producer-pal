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
    "Requires slot (session) and/or trackIndex + arrangementStart (arrangement).\n" +
    "For audio: use sampleFile (absolute path), otherwise omit sampleFile to create a MIDI clip.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    slot: z.coerce
      .string()
      .optional()
      .describe(
        "session clip slot(s): trackIndex/sceneIndex, comma-separated (e.g., '0/0' or '0/0,0/2,0/5')",
      ),

    trackIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based track index (arrangement clips)"),

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
        "duration in bar:beat (e.g., '4:0' = 4 bars), default: next full bar after latest note",
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
  },

  smallModelModeConfig: {
    excludeParams: ["transforms", "code", "firstStart", "auto"],
    descriptionOverrides: {
      slot: "session clip slot(s): trackIndex/sceneIndex (e.g., '0/0')",
      arrangementStart: "arrangement clip bar|beat position (e.g., '1|1')",
      name: "clip name",
      color: "#RRGGBB",
    },
  },
});
