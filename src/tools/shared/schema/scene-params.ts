// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z, type ZodType } from "zod";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

/**
 * The scene name and color create-scene and update-scene both take, each with a
 * per-scene list form, worded identically.
 * @returns Param schemas to spread into a tool's inputSchema
 */
export function sceneNameColorParams(): Record<string, ZodType> {
  return {
    name: param(z.string().optional(), {
      default: "name, or comma-separated one per scene",
      smallModel: "scene name",
    }),
    color: param(z.string().optional(), {
      default: "#RRGGBB, or comma-separated one per scene",
      smallModel: "#RRGGBB",
    }),
  };
}
