// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One place that turns a tool's raw inputSchema into the two schemas every
// caller needs: the one that validates and the one that gets published. Both
// MCP registration (define-tool.ts) and GET /api/tools go through here — when
// only one of them applied the hidden-param filter, REST served a param the MCP
// catalog hid.

import { type ZodType } from "zod";
import {
  collectHiddenParams,
  type HiddenParamInfo,
} from "#src/tools/shared/tool-framework/hidden-param.ts";
import {
  filterSchemaForSmallModel,
  unpublishEnumValues,
} from "#src/tools/shared/tool-framework/filter-schema.ts";
import {
  type ModeContext,
  resolveParamModes,
} from "#src/tools/shared/tool-framework/modal-config.ts";

export interface ResolvedToolSchema {
  /** Every param the handler accepts, hidden ones included. */
  validating: Record<string, ZodType>;
  /** What the model sees: `validating` minus the hidden params. */
  published: Record<string, ZodType>;
  hidden: Record<string, HiddenParamInfo>;
  excludeEnumValues: Record<string, string[]>;
}

/**
 * Resolves a tool's input schema for one request's modes.
 * @param inputSchema - The tool's raw input schema
 * @param context - The active notation and small-model flag
 * @returns The validating and published schemas, plus what was hidden
 */
export function resolveToolSchema(
  inputSchema: Record<string, ZodType>,
  context: ModeContext,
): ResolvedToolSchema {
  // Resolve every param's co-located modes into the flat exclude/override maps
  // filterSchemaForSmallModel consumes. Notation wins over small-model per
  // param; a mode's `null` hides the param.
  const resolved = resolveParamModes(inputSchema, context);
  // filterSchemaForSmallModel returns the schema unchanged when there is
  // nothing to exclude or override, so calling it unconditionally is a no-op
  // for tools/contexts without any active modes.
  const validating = filterSchemaForSmallModel(
    inputSchema,
    resolved.excludeParams,
    resolved.descriptionOverrides,
    resolved.excludeEnumValues,
  );
  const hidden = collectHiddenParams(validating);
  const hiddenKeys = Object.keys(hidden);
  const visible =
    hiddenKeys.length === 0
      ? validating
      : Object.fromEntries(
          Object.entries(validating).filter(
            ([key]) => !hiddenKeys.includes(key),
          ),
        );
  // The last trim happens here and nowhere else: an enum value `default` hides
  // is one the model is never offered but the handler still accepts, so it must
  // not reach `validating` above — and it must stay acceptable here too, since
  // the MCP SDK gates every call on this schema.
  const published = unpublishEnumValues(
    visible,
    resolved.unpublishedEnumValues,
  );

  return {
    validating,
    published,
    hidden,
    excludeEnumValues: resolved.excludeEnumValues,
  };
}
