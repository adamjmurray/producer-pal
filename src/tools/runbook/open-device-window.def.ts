// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefOpenDeviceWindow = defineTool("ppal-open-device-window", {
  title: "Open Device Window Runbook",
  description:
    "Generate a deterministic computer-use step plan to open a device's floating plugin editor window (VST/AU/Max-for-Live) in Live's Device View. Returns JSON only - the caller executes via mcp__computer-use__*. Compose with ppal-select (devicePath) FIRST so Live scrolls the device into the Device View. verify is vision-only (no Live API exposes plugin-window state). Native Live devices have no floating window.",

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    devicePath: z
      .string()
      .min(1)
      .describe(
        "device path to open (e.g. 't0/d1'); select it via ppal-select first. Echoed in verify/meta",
      ),
    editX: z
      .number()
      .int()
      .optional()
      .describe(
        "explicit x of the show-plugin-window button. MUST be supplied together with editY or both omitted - a half-override lands the click on the wrong spot silently. Not coerced: null/'' are rejected rather than silently becoming 0",
      ),
    editY: z
      .number()
      .int()
      .optional()
      .describe(
        "explicit y of the show-plugin-window button. MUST be supplied together with editX (see editX)",
      ),
    abletonLocale: z
      .enum(["de", "en", "unknown"])
      .optional()
      .describe(
        "advisory hint for meta.abletonLocale; pixel anchors are locale-agnostic",
      ),
  },

  smallModelModeConfig: {
    excludeParams: ["editX", "editY", "abletonLocale"],
  },
});
