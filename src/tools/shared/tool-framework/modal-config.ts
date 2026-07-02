// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ZodType } from "zod";
import { type Notation } from "#src/shared/notation.ts";

/**
 * Modal tool config: per-arg and per-tool-description overrides keyed by the
 * "mode" in effect. Two independent axes are live at runtime — model size
 * (large / `smallModel`) and notation (`config.notation`, with the `barbeat`
 * default falling through) — for 8 (size × notation) combinations. Overrides are
 * co-located with the thing they modify — a param via {@link param}, the tool
 * text via the `description` field — so there is no separate lookup table and no
 * dangling-reference risk.
 *
 * The 8 grid cells map 1:1 to `default` + the {@link ModeKey}s: large×barbeat is
 * `default`, small×barbeat is `smallModel`, large×notation is the bare notation
 * (e.g. `stark`), and small×notation is the compound `smallModel:{notation}`.
 * Resolution walks a most-specific-first ladder (compound cell → notation →
 * smallModel → default) and the first key present wins outright, so a bare
 * notation also serves as small's fallback until you pin its compound cell.
 */
export type NonDefaultNotation = Exclude<Notation, "barbeat">;

/**
 * A mode key: the active notation (non-barbeat), `smallModel` (small model, any
 * notation), or a compound `smallModel:{notation}` cell pinning both axes.
 */
export type ModeKey =
  | NonDefaultNotation
  | "smallModel"
  | `smallModel:${NonDefaultNotation}`;

/** Tool `description`: a plain string, or per-mode text over a required base. */
export type ModalDescription =
  | string
  | ({ default: string } & Partial<Record<ModeKey, string>>);

/**
 * A param's value in one mode: a replacement description string, `null` to hide
 * the param entirely in that mode, or an object to trim enum values (with an
 * optional description). Absent key ⇒ a less-specific key (or `default`) applies.
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
 * exclude/override maps that {@link filterSchemaForSmallModel} consumes. Each
 * param resolves to a single winning value via the most-specific-first key
 * ladder (compound cell → notation → smallModel); `null` hides the param, a
 * string overrides its description, an object overrides description and/or trims
 * enum values.
 * @param inputSchema - The tool's raw input schema
 * @param context - The active notation and small-model flag
 * @returns Flattened excludeParams / descriptionOverrides / excludeEnumValues
 */
export function resolveParamModes(
  inputSchema: Record<string, ZodType>,
  context: ModeContext,
): ResolvedParamModes {
  const ladder = modeKeyLadder(context);
  const excludeParams: string[] = [];
  const descriptionOverrides: Record<string, string> = {};
  const excludeEnumValues: Record<string, string[]> = {};

  for (const [key, schema] of Object.entries(inputSchema)) {
    const modes = getParamModes(schema);

    if (modes == null) continue;

    const winner = firstPresent(ladder, (k) => modes[k]);

    if (winner === undefined) continue;

    if (winner === null) {
      excludeParams.push(key);
      continue;
    }

    const desc = descriptionOf(winner);

    if (desc != null) descriptionOverrides[key] = desc;

    const enums = enumValuesOf(winner);

    if (enums != null) excludeEnumValues[key] = enums;
  }

  return { excludeParams, descriptionOverrides, excludeEnumValues };
}

/**
 * Resolves a tool `description` for the active context via the same
 * most-specific-first key ladder as {@link resolveParamModes} (compound cell →
 * notation → smallModel → default). A plain-string description is returned as-is.
 * @param description - The tool's modal or plain description
 * @param context - The active notation and small-model flag
 * @returns The resolved description string
 */
export function resolveModalDescription(
  description: ModalDescription,
  context: ModeContext,
): string {
  if (typeof description === "string") return description;

  const winner = firstPresent(modeKeyLadder(context), (k) => description[k]);

  return winner ?? description.default;
}

/**
 * Builds the most-specific-first ladder of mode keys active for a context: the
 * compound `smallModel:{notation}` cell (small + non-barbeat), then the bare
 * notation (non-barbeat), then `smallModel` (small). Empty for large×barbeat.
 * @param context - The active notation and small-model flag
 * @returns Mode keys to try in precedence order
 */
function modeKeyLadder(context: ModeContext): ModeKey[] {
  const notation =
    context.notation != null && context.notation !== "barbeat"
      ? context.notation
      : undefined;
  const small = context.smallModelMode === true;
  const keys: ModeKey[] = [];

  if (small && notation != null) keys.push(`smallModel:${notation}`);

  if (notation != null) keys.push(notation);

  if (small) keys.push("smallModel");

  return keys;
}

/**
 * Returns the first defined value produced by `pick` over the ladder keys.
 * @param ladder - Mode keys in precedence order
 * @param pick - Reads a key's value from a mode map
 * @returns The first non-undefined value, or undefined if none
 */
function firstPresent<T>(
  ladder: ModeKey[],
  pick: (key: ModeKey) => T | undefined,
): T | undefined {
  for (const key of ladder) {
    const value = pick(key);

    if (value !== undefined) return value;
  }

  return undefined;
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
