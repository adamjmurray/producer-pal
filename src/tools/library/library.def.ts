// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefLibrary = defineTool("ppal-library", {
  title: "Library",
  description:
    "Search Live's browser library by name, tags, kind, or source. Defaults to audio samples (the only kind currently loadable into clips/Simpler); other kinds are discovery-only — pass kind explicitly to query them. Items from the user's configured sample folder always appear before Live's library items (folder is an explicit user choice); within each group, results sort by use_count desc by default.",

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

    query: z
      .string()
      .optional()
      .describe(
        "name substring (search only); SQL LIKE wildcards % (any chars) and _ (single char) pass through",
      ),

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
        "content kind filter (search only; default: audio — the only kind loadable into clips/Simpler today, others are discovery-only). audio=.wav/.aif/.mp3/etc. samples | midi=.mid files | live-clip=.alc Ableton clips | preset=instrument/effect presets | device-group=.adg device chains (racks) | m4l-device=.amxd Max for Live devices | live-set=.als project files | plugin=VST/AU specs and presets | image/video=media assets | folder=directory entries",
      ),

    deviceKind: z
      .enum(["instrument", "audiofx", "midifx"])
      .optional()
      .describe("device classification filter (search only)"),

    source: z
      .enum(["folder", "user", "pack", "builtin", "cloud", "plugin"])
      .optional()
      .describe(
        "where the file lives (search only). folder=user-configured sample folder | user=your User Library | pack=installed Packs (factory + 3rd-party) | builtin=Ableton's Core Library | cloud=Cloud-stored items | plugin=installed VST/AU/etc. plugins",
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
