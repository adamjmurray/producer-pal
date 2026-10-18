// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z, type ZodType } from "zod";
import {
  aliasParam,
  deprecatedParam,
} from "#src/tools/shared/tool-framework/hidden-param.ts";

/** Options for {@link addressingAliases}. */
export interface AddressingAliasOptions {
  /**
   * A type-named spelling of `id` to accept too, like "clipId" on a read tool.
   * Folds onto `id` the same way `ids` does.
   */
  idAlias?: string;
}

/**
 * The unpublished spellings of `id` and `path` that every addressable tool
 * accepts: the plurals a model reaches for when it has several targets, plus an
 * optional type-named `id`. Spread where `ids` goes — `paths` follows it, which
 * is where every tool already put it.
 * @param options - A type-named `id` alias to accept alongside `ids`
 * @returns Param schemas to spread into a tool's inputSchema
 */
export function addressingAliases(
  options: AddressingAliasOptions = {},
): Record<string, ZodType> {
  const { idAlias } = options;

  return {
    ids: aliasParam(z.coerce.string().optional(), { canonical: "id" }),
    ...(idAlias == null
      ? {}
      : {
          [idAlias]: aliasParam(z.coerce.string().optional(), {
            canonical: "id",
          }),
        }),
    paths: aliasParam(z.coerce.string().optional(), { canonical: "path" }),
  };
}

/**
 * The unpublished ways a model names a clip slot instead of `path`: the old
 * `slot` param, and a track and scene index like the rest of the toolset uses.
 * @param example - A slot path to show in the alias hint, like "t0/s0"
 * @returns Param schemas to spread into a tool's inputSchema after `path`
 */
export function clipSlotAliases(example: string): Record<string, ZodType> {
  return {
    slot: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "path",
    }),
    trackIndex: aliasParam(z.coerce.number().int().min(0).optional(), {
      canonical: "path",
      example,
    }),
    sceneIndex: aliasParam(z.coerce.number().int().min(0).optional(), {
      canonical: "path",
      example,
    }),
  };
}
