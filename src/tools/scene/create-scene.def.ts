// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { deprecatedParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";
import { scenePathFromIndex } from "#src/tools/shared/validation/helpers/path-from-index.ts";
import { numberList } from "#src/tools/shared/validation/lists/typed-lists.ts";

/** How a per-scene param pairs with the scenes the call names. */
const PER_SCENE = " One for all, or comma-separated one per scene, in order.";

export const toolDefCreateScene = defineTool("ppal-create-scene", {
  title: "Create Scene",
  // Small model mode drops `capture`, so neither string may mention it — and
  // with capture gone, path is required outright (the handler throws without
  // it) rather than conditionally.
  description: {
    default:
      "Create empty scene(s) or capture playing session clips. Params with no " +
      "list form apply to every scene.",
    smallModel: "Create an empty scene.",
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    path: param(z.coerce.string().optional(), {
      default:
        "where they go: 's+' appends, 's<index>' inserts there and shifts the rest down (s0 is the first scene, so a user's \"scene 3\" is s2). Comma-separated for several, one entry per scene, in order (e.g. 's+,s+' appends two, 's2,s2' inserts two at 2). Required when capture=false, optional when capture=true",
      smallModel:
        "required: 's+' to append, or 's<index>' to insert there and shift the rest down (s0 is the first scene, so a user's \"scene 3\" is s2)",
    }),

    sceneIndex: deprecatedParam(z.coerce.number().int().min(0).optional(), {
      replacedBy: "path",
      example: scenePathFromIndex,
    }),

    count: deprecatedParam(z.coerce.number().int().min(1).optional(), {
      replacedBy: "path",
      example: "s+,s+",
      note: "path names every scene, so repeat it once per scene instead of counting",
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
    tempo: param(numberList().optional(), {
      default: `BPM, 20 to 999 (-1 disables when capturing).${PER_SCENE}`,
      smallModel: null,
    }),
    timeSignature: param(z.string().optional(), {
      default: `N/D (4/4), or "disabled" when capturing.${PER_SCENE}`,
      smallModel: null,
    }),
  },
});
