// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import {
  LIBRARY_DEVICE_KIND_VALUES,
  LIBRARY_KIND_VALUES,
  LIBRARY_SORT_VALUES,
  LIBRARY_SOURCE_VALUES,
  LIBRARY_TYPE_VALUES,
  queriesInputSchema,
} from "#src/tools/session/library-query-schema.ts";
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
      .enum([
        "search",
        "listTags",
        "listCategories",
        "searchBatch",
        "listPlugins",
      ])
      .optional()
      // Default required so smallModelModeConfig.excludeEnumValues.action can
      // filter it — filterEnumValues only accepts a schema with a top-level
      // .default(). Matches library.ts which treats a missing action as search.
      .default("search")
      .describe(
        "search: filter library items (default) | listTags: enumerate available tags | listCategories: browse Live's category taxonomy (Sounds, Drums, Genres, …); pass category to drill into its tags | searchBatch: run many filtered searches in one call (e.g. build a drum kit), results grouped per query | listPlugins: list installed VST/VST3/AU plugins Live knows about (filter with query, vendor, format, deviceKind, subcategory)",
      ),

    queries: queriesInputSchema.describe(
      "searchBatch only: array of query objects, each with the same filters as a single search (query, tags, kind, type, deviceKind, source, inFolder, sort, limit) plus an optional label; results are returned in order, grouped per query (capped at 20)",
    ),

    query: z.coerce
      .string()
      .optional()
      .describe(
        "name substring (search: supports * as a multi-character wildcard; listPlugins: plain case-insensitive substring)",
      ),

    tags: z.coerce
      .string()
      .optional()
      .describe(
        "comma-separated tag names; results must match ALL listed tags (search only)",
      ),

    kind: z
      .enum(LIBRARY_KIND_VALUES)
      .optional()
      .default("audio")
      .describe(
        "content kind filter (search only; default: audio — the only kind loadable into clips/Simpler today, others are discovery-only). audio=.wav/.aif/.mp3/etc. samples | midi=.mid files PLUS MIDI Live clips (.alc), so it covers all MIDI content | live-clip=all .alc Ableton clips (MIDI+audio; each result reports subtype) | preset=instrument/effect presets | device-group=.adg device chains (racks) | m4l-device=.amxd Max for Live devices | live-set=.als project files | plugin=VST/AU specs and presets | image/video=media assets | folder=directory entries (a DB row type, distinct from source:sampleFolder)",
      ),

    type: z
      .enum(LIBRARY_TYPE_VALUES)
      .optional()
      .describe(
        "playback type filter (search only): loop=loops | oneshot=one-shots (e.g. a kick) | impulse-response=convolution IRs. Also reported per result as `type`.",
      ),

    category: z.coerce
      .string()
      .optional()
      .describe(
        "listCategories only: a top-level category name (from listCategories with no category) to drill into; returns its tag names, each usable as a tags filter",
      ),

    deviceKind: z
      .enum(LIBRARY_DEVICE_KIND_VALUES)
      .optional()
      .describe(
        "device classification filter (search + listPlugins; for listPlugins only instrument/audiofx apply)",
      ),

    vendor: z.coerce
      .string()
      .optional()
      .describe(
        "vendor/manufacturer substring, case-insensitive (listPlugins only)",
      ),

    format: z
      .enum(["VST", "VST3", "AU"])
      .optional()
      .describe("plugin binary format filter (listPlugins only)"),

    subcategory: z.coerce
      .string()
      .optional()
      .describe(
        "subcategory substring filter, case-insensitive (listPlugins only; matches any of a plugin's genre/role tags, e.g. reverb, delay, synth). Also reported per result as `subcategories`.",
      ),

    source: z
      .enum(LIBRARY_SOURCE_VALUES)
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
      .enum(LIBRARY_SORT_VALUES)
      .optional()
      .describe("sort order (search only); defaults to use_count desc"),

    verifyPaths: z
      .boolean()
      .optional()
      .describe(
        "search only: stat each result's path and add pathExists (true/false) so you can skip files moved/deleted since Live last indexed. Off by default (one filesystem check per result).",
      ),

    limit: z.coerce
      .number()
      .optional()
      .describe("max results; defaults to 50 (search) or 200 (listTags)"),
  },

  smallModelModeConfig: {
    toolDescription:
      "Search Live's library by name/tags. Defaults to audio samples. Items from the user's sample folder appear before Live's library items.",
    // listPlugins is discovery-only (like searchBatch); its vendor/format
    // filters are excluded since the action itself is hidden from small models.
    excludeParams: [
      "deviceKind",
      "sort",
      "queries",
      "verifyPaths",
      "vendor",
      "format",
      "category",
      "subcategory",
    ],
    excludeEnumValues: {
      action: ["listCategories", "searchBatch", "listPlugins"],
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
      type: "playback type: loop | oneshot | impulse-response",
      kind: "content kind (default: audio). audio | midi | preset | device-group",
      source:
        "where the file lives. sampleFolder | user | pack | builtin | cloud | plugin",
      inFolder: "absolute folder path; returns immediate children only",
      limit: "max results; defaults to 50 (search) or 200 (listTags)",
    },
  },
});
