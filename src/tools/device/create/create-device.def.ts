// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefCreateDevice = defineTool("ppal-create-device", {
  title: "Create Device",
  description: `Create a native Live device (instrument, MIDI effect, or audio effect) on a track or inside a chain`,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    deviceName: z
      .string()
      .optional()
      .describe("device name, omit to list available devices"),
    path: z
      .string()
      .optional()
      .describe(
        "insertion path (required when deviceName provided): t=track, rt=return, mt=master, d=device position, c=chain, rc=return chain, p=drum pad. " +
          "E.g., 't0' append to track, 't0/d1' insert at position 1, 't0/d0/c0' append to chain",
      ),
  },
});
