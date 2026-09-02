// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { deprecatedParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefCreateTrack = defineTool("ppal-create-track", {
  title: "Create Track",
  description: "Create track(s).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    path: param(z.coerce.string().optional(), {
      default:
        "where it goes: 't+' appends, 't2' inserts at 2, 'rt+' adds a return track",
      smallModel: "'t+' to append, or 't2' to insert at 2",
    }),
    trackIndex: deprecatedParam(z.coerce.number().int().min(-1).optional(), {
      replacedBy: "path",
    }),
    count: param(z.coerce.number().int().min(1).default(1), {
      default: "number to create",
      smallModel: null,
    }),
    name: param(z.string().optional(), {
      default: "name for all, or comma-separated for each",
      smallModel: "track name",
    }),
    color: param(z.string().optional(), {
      default: "#RRGGBB for all, or comma-separated one per track, in order",
      smallModel: "#RRGGBB",
    }),
    type: param(z.enum(["midi", "audio", "return"]).default("midi"), {
      // "return" still works for a caller that hasn't moved to "rt+", but the
      // path is the way to ask for one now, so it isn't offered.
      default: { description: "type", excludeEnumValues: ["return"] },
    }),
    mute: param(z.boolean().optional(), {
      default: "muted?",
      smallModel: null,
    }),
    solo: param(z.boolean().optional(), {
      default: "soloed?",
      smallModel: null,
    }),
    arm: param(z.boolean().optional(), {
      default: "record armed?",
      smallModel: null,
    }),
  },
});
