// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefDelete = defineTool("ppal-delete", {
  title: "Delete",
  description:
    "Delete objects. Supports tracks, scenes, clips, devices, and drum pads. " +
    "Use ids for most types; path for clips, devices, and drum pads.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: param(z.coerce.string().optional(), {
      default: "comma-separated ID(s) to delete (must be same type)",
      smallModel: "object ID to delete",
    }),
    path: param(z.coerce.string().optional(), {
      default:
        "comma-separated paths to delete: session clips ('t0/s1'), devices ('t0/d1'), drum pads ('t1/d0/pC1')",
      smallModel: "path to delete (e.g., 't0/s1' or 't0/d1')",
    }),
    // Required even though IDs encode type — intentional safety net for destructive operation
    type: z
      .enum(["track", "scene", "clip", "device", "drum-pad"])
      .describe("type of objects to delete"),
  },
});
