// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefRenderExport = defineTool("ppal-render-export", {
  title: "Render Export Runbook",
  description:
    "Generate a deterministic computer-use step plan to render Ableton Live's Export Audio/Video dialog. Returns JSON-only (steps, failModes, verify, meta); the caller executes it via mcp__computer-use__*. Pure recipe - no Live API call, no disk write.",

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    format: z
      .enum(["wav", "aiff", "flac", "mp3"])
      .describe("output audio format"),
    destPath: z
      .string()
      .min(1)
      .describe(
        "absolute output path including filename and extension; must not end with '/'",
      ),
    renderStart: z
      .string()
      .optional()
      .describe("bar.beat.16th render start; default = current Insert Marker"),
    renderLength: z
      .string()
      .optional()
      .describe(
        "bar.beat.16th render length; default = current Loop bracket or selection",
      ),
    includeReturnsAndMaster: z
      .boolean()
      .optional()
      .describe("toggle 'Mit Return- & Master-Effekten'"),
    asLoop: z.boolean().optional().describe("toggle 'Als Loop rendern'"),
    mono: z.boolean().optional().describe("toggle 'In Mono konvertieren'"),
    normalize: z.boolean().optional().describe("toggle 'Normalisieren'"),
    createAnalysisFile: z
      .boolean()
      .optional()
      .describe("toggle 'Analyse-Datei erzeugen' (default: An)"),
    abletonLocale: z
      .enum(["de", "en", "unknown"])
      .optional()
      .describe(
        "advisory hint for meta.abletonLocale; pixel anchors are locale-agnostic",
      ),
  },

  smallModelModeConfig: {
    excludeParams: ["createAnalysisFile", "asLoop", "abletonLocale"],
  },
});
