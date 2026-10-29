// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z } from "zod";
import { aliasedEnum } from "#src/tools/shared/tool-framework/enum-aliases.ts";
import { optionalParams } from "#src/tools/shared/tool-framework/unset-empty-params.ts";

// Shared enum value lists so the single-search params (library.def.ts) and
// the per-query batch schema stay in lockstep and avoid duplicated literals.
export const LIBRARY_KIND_VALUES = [
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
] as const;

export const LIBRARY_TYPE_VALUES = [
  "loop",
  "oneshot",
  "impulse-response",
] as const;

export const LIBRARY_DEVICE_KIND_VALUES = [
  "instrument",
  "audiofx",
  "midifx",
] as const;

export const LIBRARY_SOURCE_VALUES = [
  "sample-folder",
  "user",
  "pack",
  "builtin",
  "cloud",
  "plugin",
  "preset-folder",
] as const;

export const LIBRARY_ACTION_VALUES = [
  "search",
  "list-tags",
  "list-categories",
  "list-plugins",
  "find-similar",
  "find-duplicates",
  "search-batch",
] as const;

export const LIBRARY_SORT_VALUES = ["use-count", "mod-date", "name"] as const;

// Old camelCase and snake_case spellings, still accepted but never published.
export const LIBRARY_SOURCE_ALIASES = {
  sampleFolder: "sample-folder",
} as const;

export const LIBRARY_ACTION_ALIASES = {
  listTags: "list-tags",
  listCategories: "list-categories",
  listPlugins: "list-plugins",
  findSimilar: "find-similar",
  findDuplicates: "find-duplicates",
  searchBatch: "search-batch",
} as const;

export const LIBRARY_SORT_ALIASES = {
  use_count: "use-count",
  mod_date: "mod-date",
} as const;

/**
 * One query in a `searches` fan-out. Fields mirror the single-search scalars
 * (all optional) plus an optional `label` used to group that query's results
 * in the response. Reuses the same enums as the top-level params so a fanned-out
 * query is filtered identically to a single search.
 */
export const batchQuerySchema = z.object(
  optionalParams({
    label: z.coerce.string().optional(),
    query: z.coerce.string().optional(),
    tags: z.coerce.string().optional(),
    kind: z
      .enum(LIBRARY_KIND_VALUES)
      .optional()
      // Default to audio to match the single-search default; without it, the
      // search path falls back to all kinds, so a batch query omitting kind would
      // silently behave differently from the same standalone search.
      // This description is the only place the model sees the default inside
      // `searches`, so keep it.
      .default("audio")
      .describe("default: audio"),
    type: z.enum(LIBRARY_TYPE_VALUES).optional(),
    deviceKind: z.enum(LIBRARY_DEVICE_KIND_VALUES).optional(),
    source: aliasedEnum(
      LIBRARY_SOURCE_VALUES,
      LIBRARY_SOURCE_ALIASES,
    ).optional(),
    inFolder: z.coerce.string().optional(),
    sort: aliasedEnum(LIBRARY_SORT_VALUES, LIBRARY_SORT_ALIASES).optional(),
    verifyPaths: z.boolean().optional(),
    limit: z.coerce.number().optional(),
  }),
);

/**
 * `searches` input schema: the fan-out form of the search action.
 *
 * Advertised as a clean array of query objects — never a `string | array`
 * union alongside `query`, which is the one shape models fill wrong (Claude
 * collapses it to the scalar and drops the rest; see dev/tools/tool-schemas.md).
 * The `preprocess` step also accepts a JSON-stringified array, absorbing the
 * habit of stringifying structured args without exposing that fragility in
 * the schema.
 */
export const searchesInputSchema = z
  .preprocess((value) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    return value;
  }, z.array(batchQuerySchema))
  .optional();
