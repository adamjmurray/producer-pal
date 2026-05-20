// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefRecordArrangement = defineTool("ppal-record-arrangement", {
  title: "Record Arrangement Runbook",
  description:
    "Generate a deterministic computer-use step plan for Ableton's Arrangement-Record workflow (record button click + transport stop + optional save). Returns JSON only - the caller executes it via mcp__computer-use__*. Compose with ppal-playback (jump-to-cue) and ppal-update-track (arm=true) first.",

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    durationSeconds: z.coerce
      .number()
      .min(0.1)
      .optional()
      .describe(
        "if set, recipe waits this many seconds before stopping; otherwise caller stops manually",
      ),
    view: z
      .enum(["arrangement", "session"])
      .optional()
      .describe(
        "ensure Live is in this view before recording; default 'arrangement'",
      ),
    homeBeforeRecord: z
      .boolean()
      .optional()
      .describe("press Home to reset insert marker to 1.1.1 before recording"),
    saveAfter: z
      .enum(["none", "save", "save-as"])
      .optional()
      .describe(
        "save the set after stopping; default 'none'. 'save-as' requires savePath",
      ),
    savePath: z
      .string()
      .optional()
      .describe(
        "absolute .als path including filename; required when saveAfter='save-as'",
      ),
    abletonLocale: z
      .enum(["de", "en", "unknown"])
      .optional()
      .describe(
        "advisory hint for meta.abletonLocale; pixel anchors are locale-agnostic",
      ),
  },

  smallModelModeConfig: {
    excludeParams: ["homeBeforeRecord", "abletonLocale"],
  },
});
