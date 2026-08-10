// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefSelect = defineTool("ppal-select", {
  title: "Select",
  description:
    'Navigate to and select items in Live. Use for "show me", "go to", "open" requests. No args: read current state.',

  // read-only on purpose, even though selecting changes view state and can
  // show/hide/focus views. None of that touches the Live Set or its undo history,
  // and a user who puts a client in read-only mode still expects "show me track
  // 3" to work. Don't "correct" this to false.
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    id: z.coerce
      .string()
      .optional()
      .describe("select by ID (auto-detects track/scene/clip/device)"),

    trackIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based track index"),
    trackType: z
      .enum(["return", "master"])
      .optional()
      .describe("omit for audio/midi tracks, or: return, master"),

    sceneIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based scene index"),

    slot: z.coerce
      .string()
      .optional()
      .describe("session clip slot: trackIndex/sceneIndex (e.g., '0/3')"),

    devicePath: z
      .string()
      .optional()
      .describe("select device by path (e.g. t0/d1)"),

    openPluginWindow: param(z.boolean().optional(), {
      default:
        "open (true) or close (false) a plug-in's (VST/AU) floating editor window; targets the device given by id or devicePath",
      smallModel: null,
    }),

    view: z.enum(["session", "arrangement"]).optional().describe("main view"),
  },
});
