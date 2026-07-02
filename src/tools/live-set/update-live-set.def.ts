// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefUpdateLiveSet = defineTool("ppal-update-live-set", {
  title: "Update Live Set",
  description: {
    default: "Update Live Set global settings or manage locators.",
    smallModel: "Update Live Set global settings",
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    tempo: z.coerce.number().min(20).max(999).optional().describe("BPM"),
    timeSignature: z.string().optional().describe("N/D (4/4)"),
    scale: z
      .string()
      .optional()
      .describe(
        '"Root ScaleName" ("C Major", "F# Minor", "Bb Dorian"). Empty string disables scale',
      ),

    locatorOperation: param(z.enum(["create", "delete", "rename"]).optional(), {
      default: "Locator operation",
      smallModel: null,
    }),
    locatorId: param(z.coerce.string().optional(), {
      default:
        "Locator ID for delete/rename (e.g. locator-0). Positional — shifts if locators are added/removed, so prefer locatorTime or locatorName",
      smallModel: null,
    }),
    locatorTime: param(z.string().optional(), {
      default:
        "Bar|beat position, song meter (required for create, alt ID for delete/rename)",
      smallModel: null,
    }),
    locatorName: param(z.string().optional(), {
      default: "Name for create/rename, or name-match filter for delete",
      smallModel: null,
    }),
    // arrangementFollower removed from interface - play-arrangement always auto-follows
  },
});
