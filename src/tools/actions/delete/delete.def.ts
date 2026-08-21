// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { aliasParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefDelete = defineTool("ppal-delete", {
  title: "Delete",
  description:
    "Delete objects. Supports tracks, scenes, clips, devices, drum pads, and drum rack chains. " +
    "Use id for most types; path for clips, devices, drum pads, and chains.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    id: param(z.coerce.string().optional(), {
      default:
        "ID(s) to delete, comma-separated for multiple (must be same type)",
      smallModel: "object ID to delete",
    }),

    ids: aliasParam(z.coerce.string().optional(), {
      canonical: "id",
    }),
    path: param(z.coerce.string().optional(), {
      default:
        "comma-separated paths to delete: session clips ('t0/s1'), devices ('t0/d1'), drum pads ('t1/d0/pC1'), one layer of a pad ('t1/d0/pC1/c1')",
      smallModel: "path to delete (e.g., 't0/s1' or 't0/d1')",
    }),
    // Required even though IDs encode type — intentional safety net for destructive operation
    type: z
      .enum(["track", "scene", "clip", "device", "drum-pad", "chain"])
      .describe(
        "type of objects to delete; 'chain' removes one chain from a Drum Rack pad",
      ),
  },
});
