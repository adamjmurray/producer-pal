// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefLoadM4lDevice = defineTool("ppal-load-m4l-device", {
  title: "Load Max-for-Live Device Runbook",
  description:
    "Generate a deterministic computer-use step plan to load a Max-for-Live device (.amxd) from Live's browser onto a track via drag-and-drop. Returns JSON only - the caller executes via mcp__computer-use__*. After load, use ppal-read-track to confirm and ppal-update-device for macros/params.",

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    deviceName: z
      .string()
      .min(1)
      .describe(
        "exact device name as listed in Live's browser (e.g. 'Max Audio Effect', or a user-library .amxd name)",
      ),
    category: z
      .enum(["max-audio-effect", "max-instrument", "max-midi-effect", "user"])
      .describe(
        "browser sub-category - 'user' for User Library .amxd's, otherwise the built-in Max-for-Live slot. ADVISORY: the three Max-for-Live sub-categories share a single browser pixel anchor; disambiguation happens via the device-name search. Echoed in verify.expectedCategory so the caller can cross-check the loaded device type against ppal-read-device after the drop",
      ),
    dropX: z.coerce
      .number()
      .int()
      .optional()
      .describe(
        "explicit drop x coordinate. MUST be supplied together with dropY or both omitted - the recipe throws on a half-override (mixing one user axis with one set-dependent default lands the drop on the wrong track silently)",
      ),
    dropY: z.coerce
      .number()
      .int()
      .optional()
      .describe(
        "explicit drop y coordinate. MUST be supplied together with dropX (see dropX)",
      ),
    useArrangementView: z
      .boolean()
      .optional()
      .describe(
        "if true, recipe emits a verify-screenshot anchor before the drop; it does NOT auto-press Tab (Tab toggles, would be unsafe). Caller dispatches Tab themselves after checking the screenshot",
      ),
    abletonLocale: z
      .enum(["de", "en", "unknown"])
      .optional()
      .describe(
        "advisory hint for meta.abletonLocale; pixel anchors are locale-agnostic",
      ),
  },

  smallModelModeConfig: {
    excludeParams: ["dropX", "dropY", "abletonLocale"],
  },
});
