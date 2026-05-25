// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";

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
  "sampleFolder",
  "user",
  "pack",
  "builtin",
  "cloud",
  "plugin",
] as const;

export const LIBRARY_SORT_VALUES = ["use_count", "mod_date", "name"] as const;

/**
 * One query in a `searchBatch` call. Fields mirror the single-search scalars
 * (all optional) plus an optional `label` used to group that query's results
 * in the response. Reuses the same enums as the top-level params so a batch
 * query is filtered identically to a single search.
 */
export const batchQuerySchema = z.object({
  label: z.coerce
    .string()
    .optional()
    .describe("label for this query's result group (defaults to its index)"),
  query: z.coerce
    .string()
    .optional()
    .describe("name substring; use * as a multi-character wildcard"),
  tags: z.coerce
    .string()
    .optional()
    .describe("comma-separated tag names; results must match ALL listed tags"),
  kind: z
    .enum(LIBRARY_KIND_VALUES)
    .optional()
    // Default to audio to match the single-search default; without it, the
    // search path falls back to all kinds, so a batch query omitting kind would
    // silently behave differently from the same standalone search.
    .default("audio")
    .describe("content kind filter (default: audio)"),
  type: z
    .enum(LIBRARY_TYPE_VALUES)
    .optional()
    .describe("playback type: loop | oneshot | impulse-response"),
  deviceKind: z
    .enum(LIBRARY_DEVICE_KIND_VALUES)
    .optional()
    .describe("device classification filter"),
  source: z
    .enum(LIBRARY_SOURCE_VALUES)
    .optional()
    .describe("where the file lives"),
  sort: z
    .enum(LIBRARY_SORT_VALUES)
    .optional()
    .describe("sort order; defaults to use_count desc"),
  limit: z.coerce.number().optional().describe("max results; defaults to 50"),
});

/**
 * `queries` input schema for the searchBatch action.
 *
 * Advertised as a clean array of query objects (no anyOf union — unions are
 * the one shape small models mis-fill). The `preprocess` step also accepts a
 * JSON-stringified array, absorbing the small-model habit of stringifying
 * structured args without exposing that fragility in the schema. searchBatch
 * is excluded from small-model mode anyway, but the tolerance is cheap and
 * keeps the path safe.
 */
export const queriesInputSchema = z
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
