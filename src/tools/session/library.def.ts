// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefLibrary = defineTool("ppal-library", {
  title: "Library",
  description:
    "Search Live's browser library by name, tags, kind, or source. Defaults to audio samples (the only kind currently loadable into clips/Simpler); other kinds are discovery-only — pass kind explicitly to query them. Items from the user's configured sample folder always appear before Live's library items (sampleFolder is an explicit user choice); within each group, results sort by use_count desc by default.",

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

    query: z.coerce
      .string()
      .optional()
      .describe(
        "name substring (search only); use * as a multi-character wildcard",
      ),

    tags: z.coerce
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
        "content kind filter (search only; default: audio — the only kind loadable into clips/Simpler today, others are discovery-only). audio=.wav/.aif/.mp3/etc. samples | midi=.mid files | live-clip=.alc Ableton clips | preset=instrument/effect presets | device-group=.adg device chains (racks) | m4l-device=.amxd Max for Live devices | live-set=.als project files | plugin=VST/AU specs and presets | image/video=media assets | folder=directory entries (a DB row type, distinct from source:sampleFolder)",
      ),

    deviceKind: z
      .enum(["instrument", "audiofx", "midifx"])
      .optional()
      .describe("device classification filter (search only)"),

    source: z
      .enum(["sampleFolder", "user", "pack", "builtin", "cloud", "plugin"])
      .optional()
      .describe(
        "where the file lives (search only). sampleFolder=user-configured sample folder on disk (bypasses Live's DB) | user=your User Library | pack=installed Packs (factory + 3rd-party) | builtin=Ableton's Core Library | cloud=Cloud-stored items | plugin=installed VST/AU/etc. plugins",
      ),

    inFolder: z.coerce
      .string()
      .optional()
      .describe(
        "absolute folder path; returns only immediate children of that folder (search only). Composes with other filters. Unresolvable paths return no results.",
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

  smallModelModeConfig: {
    toolDescription:
      "Search Live's library by name/tags. Defaults to audio samples. Items from the user's sample folder appear before Live's library items.",
    excludeParams: ["deviceKind", "sort"],
    excludeEnumValues: {
      kind: [
        "live-clip",
        "m4l-device",
        "live-set",
        "plugin",
        "image",
        "video",
        "folder",
      ],
    },
    descriptionOverrides: {
      action: "search (default) | listTags",
      query: "name substring; use * as wildcard",
      tags: "comma-separated tag names; results must match ALL",
      kind: "content kind (default: audio). audio | midi | preset | device-group",
      source:
        "where the file lives. sampleFolder | user | pack | builtin | cloud | plugin",
      inFolder: "absolute folder path; returns immediate children only",
      limit: "max results; defaults to 50 (search) or 200 (listTags)",
    },
  },
});
