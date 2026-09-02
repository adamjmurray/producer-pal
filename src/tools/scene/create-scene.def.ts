// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { deprecatedParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefCreateScene = defineTool("ppal-create-scene", {
  title: "Create Scene",
  // Small model mode drops `capture`, so neither string may mention it — and
  // with capture gone, path is required outright (the handler throws without
  // it) rather than conditionally.
  description: {
    default: "Create empty scene(s) or capture playing session clips.",
    smallModel: "Create an empty scene.",
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    path: param(z.coerce.string().optional(), {
      default:
        "where they go: 's+' appends, 's2' inserts at 2 and shifts the rest down. Required when capture=false, optional when capture=true",
      smallModel:
        "required: 's+' to append, or 's2' to insert at 2 and shift the rest down",
    }),
    sceneIndex: deprecatedParam(z.coerce.number().int().min(0).optional(), {
      replacedBy: "path",
    }),
    count: param(z.coerce.number().int().min(1).default(1), {
      default: "number to create",
      smallModel: null,
    }),
    capture: param(z.boolean().default(false), {
      default: "copy playing session clips instead of creating empty?",
      smallModel: null,
    }),
    name: param(z.string().optional(), {
      default: "name for all, or comma-separated one per scene, in order",
      smallModel: "scene name",
    }),
    color: param(z.string().optional(), {
      default: "#RRGGBB for all, or comma-separated one per scene, in order",
      smallModel: "#RRGGBB",
    }),
    tempo: param(z.coerce.number().optional(), {
      default: "BPM (-1 disables when capturing)",
      smallModel: null,
    }),
    timeSignature: param(z.string().optional(), {
      default: 'N/D (4/4) or "disabled" when capturing',
      smallModel: null,
    }),
  },
});
