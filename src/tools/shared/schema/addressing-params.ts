// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z, type ZodType } from "zod";
import { aliasParam } from "#src/tools/shared/tool-framework/hidden-param.ts";

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
