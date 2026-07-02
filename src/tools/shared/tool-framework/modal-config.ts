// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ZodType } from "zod";
import { type Notation } from "#src/shared/notation.ts";

/**
 * Modal tool config: per-arg and per-tool-description overrides keyed by the
 * "mode" in effect. Modes are the active notation (`config.notation`, minus the
 * `barbeat` default which falls through) and `smallModel`. Overrides are
 * co-located with the thing they modify — a param via {@link param}, the tool
 * text via the `description` field — so there is no separate lookup table and no
 * dangling-reference risk. Notation wins over small-model for the same target.
 */
export type ModeKey = Exclude<Notation, "barbeat"> | "smallModel";

/** Tool `description`: a plain string, or per-mode text over a required base. */
export type ModalDescription =
  | string
  | ({ default: string } & Partial<Record<ModeKey, string>>);

/**
 * A param's value in one mode: a replacement description string, `null` to hide
 * the param entirely in that mode, or an object to trim enum values (with an
 * optional description). Absent key ⇒ the base `default` applies.
 */
export type ParamModeValue =
  | string
  | null
  | { description?: string; excludeEnumValues?: string[] };

/** A param's per-mode overrides over its required base description. */
export type ParamModeMap = { default: string } & Partial<
  Record<ModeKey, ParamModeValue>
>;

/** Result of resolving param modes into the flat shape filter-schema expects. */
export interface ResolvedParamModes {
  excludeParams: string[];
  descriptionOverrides: Record<string, string>;
  excludeEnumValues: Record<string, string[]>;
}

interface ModeContext {
  notation?: Notation;
  smallModelMode?: boolean;
}

// Associates a schema instance with its modes without changing its type, so
// every consumer of inputSchema still sees an ordinary described ZodType and the
// mode map never leaks into the published JSON schema.
const PARAM_MODES = new WeakMap<ZodType, ParamModeMap>();

/**
 * Wraps a param schema with per-mode overrides. The `default` description is
 * applied via `.describe()` (so all schema consumers keep working unchanged),
 * and the full mode map is stashed for {@link resolveParamModes}.
 * @param schema - The param's Zod schema
 * @param modes - Per-mode overrides over the required `default` description
 * @returns The schema described with `default`, tagged with its modes
 */
export function param<T extends ZodType>(schema: T, modes: ParamModeMap): T {
  const described = schema.describe(modes.default);

  PARAM_MODES.set(described, modes);

  return described;
}

/**
 * Reads the per-mode overrides attached to a schema by {@link param}.
 * @param schema - A param schema
 * @returns Its mode map, or undefined if it has no modal overrides
 */
export function getParamModes(schema: ZodType): ParamModeMap | undefined {
  return PARAM_MODES.get(schema);
}

/**
 * Resolves every param's modes for the active context into the flat
 * exclude/override maps that {@link filterSchemaForSmallModel} consumes.
 * Description and enum-value overrides resolve independently; for each, notation
 * wins over small-model. A `null` in any active mode hides the param.
 * @param inputSchema - The tool's raw input schema
 * @param context - The active notation and small-model flag
 * @returns Flattened excludeParams / descriptionOverrides / excludeEnumValues
 */
export function resolveParamModes(
  inputSchema: Record<string, ZodType>,
  context: ModeContext,
): ResolvedParamModes {
  const useNotation =
    context.notation != null && context.notation !== "barbeat";
  const excludeParams: string[] = [];
  const descriptionOverrides: Record<string, string> = {};
  const excludeEnumValues: Record<string, string[]> = {};

  for (const [key, schema] of Object.entries(inputSchema)) {
    const modes = getParamModes(schema);

    if (modes == null) continue;

    const notationVal =
      useNotation && context.notation != null
        ? modes[context.notation as ModeKey]
        : undefined;
    const smallVal = context.smallModelMode ? modes.smallModel : undefined;

    if (notationVal === null || smallVal === null) {
      excludeParams.push(key);
      continue;
    }

    const desc = descriptionOf(notationVal) ?? descriptionOf(smallVal);

    if (desc != null) descriptionOverrides[key] = desc;

    const enums = enumValuesOf(notationVal) ?? enumValuesOf(smallVal);

    if (enums != null) excludeEnumValues[key] = enums;
  }

  return { excludeParams, descriptionOverrides, excludeEnumValues };
}

/**
 * Resolves a tool `description` for the active context. Notation wins over
 * small-model, both over the base. A plain-string description is returned as-is.
 * @param description - The tool's modal or plain description
 * @param context - The active notation and small-model flag
 * @returns The resolved description string
 */
export function resolveModalDescription(
  description: ModalDescription,
  context: ModeContext,
): string {
  if (typeof description === "string") return description;

  const notationText =
    context.notation != null && context.notation !== "barbeat"
      ? description[context.notation as ModeKey]
      : undefined;
  const smallText = context.smallModelMode ? description.smallModel : undefined;

  return notationText ?? smallText ?? description.default;
}

/**
 * Extracts a description string from a param mode value (string form, or an
 * object's `description`), or undefined if the value carries no description.
 * @param value - A resolved param mode value
 * @returns The description string, or undefined
 */
function descriptionOf(value: ParamModeValue | undefined): string | undefined {
  if (typeof value === "string") return value;

  if (value != null && typeof value === "object") return value.description;

  return undefined;
}

/**
 * Extracts excluded enum values from a param mode value, or undefined if the
 * value is not an object carrying `excludeEnumValues`.
 * @param value - A resolved param mode value
 * @returns The enum values to exclude, or undefined
 */
function enumValuesOf(value: ParamModeValue | undefined): string[] | undefined {
  if (value != null && typeof value === "object")
    return value.excludeEnumValues;

  return undefined;
}
