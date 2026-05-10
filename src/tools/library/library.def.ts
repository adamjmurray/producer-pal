// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefLibrary = defineTool("ppal-library", {
  title: "Library",
  description:
    "Search Live's browser library by name, tags, kind, or source. Defaults to audio samples (the only kind currently loadable into clips/Simpler); other kinds are discovery-only — pass kind explicitly to query them. Includes use_count for ranking.",

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    action: z
      .enum(["search", "listTags"])
      .optional()
      .describe(
        "search: filter library items (default) | listTags: enumerate available tags",
      ),

    query: z.string().optional().describe("name substring (search only)"),

    tags: z
      .string()
      .optional()
      .describe(
        "comma-separated tag names; results must match ALL listed tags (search only)",
      ),

    kind: z
      .enum([
        "audio",
        "midi",
        "live-clip",
        "preset",
        "device-group",
        "m4l-device",
        "live-set",
        "plugin",
        "image",
        "video",
        "folder",
      ])
      .optional()
      .default("audio")
      .describe(
        "content kind filter (search only; default: audio — the only kind loadable into clips/Simpler today, others are discovery-only). midi=.mid files | live-clip=.alc Ableton clips | device-group=.adg device chains | m4l-device=.amxd Max for Live devices | plugin=VST/AU specs and presets",
      ),

    deviceKind: z
      .enum(["instrument", "audiofx", "midifx"])
      .optional()
      .describe("device classification filter (search only)"),

    source: z
      .enum(["folder", "user", "pack", "builtin", "cloud", "plugin"])
      .optional()
      .describe(
        "where the file lives: folder=user-configured sample folder | user/pack/builtin/cloud/plugin=Live library categories (search only)",
      ),

    sort: z
      .enum(["use_count", "mod_date", "name"])
      .optional()
      .describe("sort order (search only); defaults to use_count desc"),

    limit: z.coerce
      .number()
      .optional()
      .describe("max results; defaults to 50 (search) or 200 (listTags)"),
  },
});
