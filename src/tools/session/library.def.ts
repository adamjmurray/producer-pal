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
  searchesInputSchema,
} from "#src/tools/session/library-query-schema.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefLibrary = defineTool("ppal-library", {
  title: "Library",
  description: {
    default:
      "Search Live's browser library by name, tags, kind, or source. Defaults to audio samples (the only kind currently loadable into clips/Simpler); other kinds are discovery-only — pass kind explicitly to query them. Items from the user's configured sample folder always appear before Live's library items (sampleFolder is an explicit user choice); within each group, results sort by use_count desc by default.",
    smallModel:
      "Search Live's library by name/tags. Defaults to audio samples. Items from the user's sample folder appear before Live's library items.",
  },

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    action: param(
      z
        .enum([
          "search",
          "listTags",
          "listCategories",
          "listPlugins",
          "findSimilar",
          "findDuplicates",
        ])
        .optional()
        // Default required so the action's excludeEnumValues override can filter
        // it — filterEnumValues only accepts a schema with a top-level
        // .default(). Matches library.ts which treats a missing action as search.
        .default("search"),
      {
        default:
          "search: filter library items (default); pass searches to run many filtered searches in one call | listTags: enumerate available tags | listCategories: browse Live's category taxonomy (Sounds, Drums, Genres, …); pass category to drill into its tags | listPlugins: list installed VST/VST3/AU plugins Live knows about (filter with query, vendor, format, deviceKind, subcategory) | findSimilar: rank samples by audio similarity to a seed sample (similarTo); combine with the search filters to constrain candidates | findDuplicates: group library samples with identical audio (re-shipped duplicates), scoped by the search filters",
        smallModel: {
          description: "search (default) | listTags",
          excludeEnumValues: [
            "listCategories",
            "listPlugins",
            "findSimilar",
            "findDuplicates",
          ],
        },
      },
    ),

    query: param(z.coerce.string().optional(), {
      default:
        "name substring (search: supports * as a multi-character wildcard, e.g. kick*acoustic; listPlugins: plain case-insensitive substring)",
      smallModel: "name substring; use * as wildcard, e.g. kick*acoustic",
    }),

    searches: param(searchesInputSchema, {
      default:
        "search only: run several filtered searches in one call (e.g. build a drum kit) instead of the top-level filters. Array of query objects, each with the same filters as a single search (query, tags, kind, type, deviceKind, source, inFolder, sort, limit, verifyPaths) plus an optional label; results come back in order, grouped per query (capped at 20)",
      smallModel: null,
    }),

    tags: param(z.coerce.string().optional(), {
      default:
        "comma-separated tag names; results must match ALL listed tags (search only)",
      smallModel: "comma-separated tag names; results must match ALL",
    }),

    kind: param(z.enum(LIBRARY_KIND_VALUES).optional().default("audio"), {
      default:
        "content kind filter (search only; default: audio — the only kind loadable into clips/Simpler today, others are discovery-only). audio=.wav/.aif/.mp3/etc. samples | midi=.mid files PLUS MIDI Live clips (.alc), so it covers all MIDI content — the right kind for melody/chord ideas | live-clip=all .alc Ableton clips (MIDI+audio; each result reports subtype) | preset=instrument/effect presets | device-group=.adg device chains (racks) | m4l-device=.amxd Max for Live devices | live-set=.als project files | plugin=VST/AU specs and presets | image/video=media assets | folder=directory entries (a DB row type, distinct from source:sampleFolder)",
      smallModel: {
        description:
          "content kind (default: audio). audio | midi (melody/chord ideas) | preset | device-group",
        excludeEnumValues: [
          "live-clip",
          "m4l-device",
          "live-set",
          "plugin",
          "image",
          "video",
          "folder",
        ],
      },
    }),

    type: param(z.enum(LIBRARY_TYPE_VALUES).optional(), {
      default:
        "playback type filter (search only): loop=loops | oneshot=one-shots (e.g. a kick) | impulse-response=convolution IRs. Prefer oneshot for hits and loop for grooves. Also reported per result as `type`.",
      smallModel:
        "playback type: loop | oneshot | impulse-response. Prefer oneshot for hits, loop for grooves",
    }),

    // listPlugins is discovery-only; its vendor/format filters are excluded
    // since the action itself is hidden from small models.
    category: param(z.coerce.string().optional(), {
      default:
        "listCategories only: a top-level category name (from listCategories with no category) to drill into; returns its tag names, each usable as a tags filter",
      smallModel: null,
    }),

    similarTo: param(z.coerce.string().optional(), {
      default:
        "findSimilar only: absolute path of a seed sample (e.g. a path from a prior search) to rank other samples by audio similarity. Combine with the search filters to constrain candidates — e.g. similarTo a kick + tags=Kick for 'more kicks like this one'. Each result carries a `similarity` score (-1 to 1, ~1 = very similar).",
      smallModel: null,
    }),

    deviceKind: param(z.enum(LIBRARY_DEVICE_KIND_VALUES).optional(), {
      default:
        "device classification filter (search + listPlugins; for listPlugins only instrument/audiofx apply)",
      smallModel: null,
    }),

    vendor: param(z.coerce.string().optional(), {
      default:
        "vendor/manufacturer substring, case-insensitive (listPlugins only)",
      smallModel: null,
    }),

    format: param(z.enum(["VST", "VST3", "AU"]).optional(), {
      default: "plugin binary format filter (listPlugins only)",
      smallModel: null,
    }),

    subcategory: param(z.coerce.string().optional(), {
      default:
        "subcategory substring filter, case-insensitive (listPlugins only; matches any of a plugin's genre/role tags, e.g. reverb, delay, synth). Also reported per result as `subcategories`.",
      smallModel: null,
    }),

    source: param(z.enum(LIBRARY_SOURCE_VALUES).optional(), {
      default:
        "where the file lives (search only). sampleFolder=user-configured sample folder on disk (bypasses Live's DB) | user=your User Library | pack=installed Packs (factory + 3rd-party) | builtin=Ableton's Core Library | cloud=Cloud-stored items | plugin=installed VST/AU/etc. plugins",
      smallModel:
        "where the file lives. sampleFolder | user | pack | builtin | cloud | plugin",
    }),

    inFolder: param(z.coerce.string().optional(), {
      default:
        "absolute folder path; returns only immediate children of that folder (search only). Composes with other filters. Case-insensitive (ASCII). Unresolvable paths return no results with a `reason` explaining the path wasn't found.",
      smallModel: "absolute folder path; returns immediate children only",
    }),

    sort: param(z.enum(LIBRARY_SORT_VALUES).optional(), {
      default: "sort order (search only); defaults to use_count desc",
      smallModel: null,
    }),

    verifyPaths: param(z.boolean().optional(), {
      default:
        "search only: stat each result's path and add pathExists (true/false) so you can skip files moved/deleted since Live last indexed. Off by default (one filesystem check per result).",
      smallModel: null,
    }),

    limit: param(z.coerce.number().optional(), {
      default: "max results; defaults to 50 (search) or 200 (listTags)",
      smallModel: "max results; defaults to 50 (search) or 200 (listTags)",
    }),
  },
});
