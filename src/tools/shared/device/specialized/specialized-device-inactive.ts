// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type InactiveWhenRule } from "./specialized-device-types.ts";

/**
 * Build an inactivity rule for the common "exclusive modes" shape: a controller
 * whose value selects exactly one param to keep active, leaving every other
 * param in the group inactive. Pass a map of controller value → the param
 * active at that value; for each value, all the other params in the group are
 * listed inactive. Keeps each param name in one place (DRY for the per-mode
 * cases). Several controller values may map to the same active param (e.g. Auto
 * Filter's Synced/Triplet/Dotted modes all drive the one note-value selector) —
 * the group is deduped so the inactive lists stay clean.
 * @param controller - Controller param display name
 * @param activeByValue - Controller value → the one param active at that value
 * @returns The assembled rule
 */
export function exclusiveModes(
  controller: string,
  activeByValue: Record<string, string>,
): InactiveWhenRule {
  const allParams = [...new Set(Object.values(activeByValue))];
  const cases: Record<string, string[]> = {};

  for (const [value, active] of Object.entries(activeByValue)) {
    cases[value] = allParams.filter((name) => name !== active);
  }

  return { controller, cases };
}

/**
 * Build a rule for a controller whose value picks one family of params that
 * share a name prefix (Drum Synth: a sound type or model owns the params named
 * after it). See `InactiveWhenRule.prefixes`.
 * @param controller - Controller param display name
 * @param prefixByValue - Controller value → prefix (or prefixes) of the params
 *   active there (null when none are)
 * @param cases - Params to switch off by name, as in `exclusiveModes`
 * @returns The assembled rule
 */
export function prefixModes(
  controller: string,
  prefixByValue: Record<string, string | readonly string[] | null>,
  cases: Record<string, string[]> = {},
): InactiveWhenRule {
  return { controller, cases, prefixes: prefixByValue };
}

/**
 * Apply sibling-driven inactivity rules to an already-read parameter list,
 * marking params `state: "inactive"` when a controller param's current value
 * makes them irrelevant (see `SpecializedDeviceSpec.inactiveWhen`). Mutates the
 * entries in place. Reuses the values already read for the response, so it adds
 * no Live API calls unless `readController` is given. Every param carrying a
 * name is marked, so two params sharing one are both covered.
 *
 * A controller absent from `parameters` (filtered out by a param search) is
 * read with `readController` when a listed param depends on it, and skips its
 * rule when there is no `readController`. An existing non-active state set by
 * Live is never overwritten.
 * @param rules - The device's inactivity rules
 * @param parameters - Parameter entries from the reader (mutated in place)
 * @param readController - Reads a controller missing from `parameters`
 */
export function applyInactiveStates(
  rules: InactiveWhenRule[],
  parameters: Record<string, unknown>[],
  readController?: (controller: string) => unknown,
): void {
  const named = parameters.filter(
    (param): param is Record<string, unknown> & { name: string } =>
      typeof param.name === "string",
  );

  for (const rule of rules) {
    const listed = named.find((param) => param.name === rule.controller);

    if (
      listed == null &&
      (readController == null ||
        !named.some((param) => ruleNamesParam(rule, param.name)))
    ) {
      continue;
    }

    const controllerValue =
      listed == null ? readController?.(rule.controller) : listed.value;

    for (const param of named) {
      // Only set when Live hasn't already assigned a state (inactive/disabled):
      // Live's own greying-out takes precedence.
      if (
        param.state == null &&
        ruleInactiveAt(rule, controllerValue, param.name)
      ) {
        param.state = "inactive";
      }
    }
  }
}

/**
 * Whether a rule set marks one param inactive. A controller is read only when a
 * rule names the param, so a param no rule touches costs nothing.
 * @param rules - The device's inactivity rules
 * @param paramName - Display name of the param
 * @param readController - Reads a controller param's current display value
 * @returns True when a rule makes the param inactive at the controller's value
 */
export function ruleMarksInactive(
  rules: InactiveWhenRule[],
  paramName: string,
  readController: (controller: string) => unknown,
): boolean {
  return rules.some(
    (rule) =>
      ruleNamesParam(rule, paramName) &&
      ruleInactiveAt(rule, readController(rule.controller), paramName),
  );
}

/**
 * Whether a rule can make a param inactive at some controller value: a `cases`
 * list names it, or it starts with one of the rule's prefixes.
 * @param rule - The inactivity rule
 * @param paramName - Display name of the param
 * @returns True when the rule governs the param
 */
function ruleNamesParam(rule: InactiveWhenRule, paramName: string): boolean {
  return (
    Object.values(rule.cases).some((names) => names.includes(paramName)) ||
    prefixesOf(rule).some((prefix) => hasPrefix(paramName, prefix))
  );
}

/**
 * Whether a rule makes a param inactive at a controller value.
 * @param rule - The inactivity rule
 * @param controllerValue - The controller's current display value
 * @param paramName - Display name of the param
 * @returns True when the param is inactive at that value
 */
function ruleInactiveAt(
  rule: InactiveWhenRule,
  controllerValue: unknown,
  paramName: string,
): boolean {
  const key = String(controllerValue);

  if (rule.cases[key]?.includes(paramName) === true) {
    return true;
  }

  if (rule.prefixes == null || controllerValue == null) {
    return false;
  }

  const active = [rule.prefixes[key] ?? []].flat();

  return (
    prefixesOf(rule).some((prefix) => hasPrefix(paramName, prefix)) &&
    !active.some((prefix) => hasPrefix(paramName, prefix))
  );
}

/**
 * Every prefix a rule's controller can select.
 * @param rule - The inactivity rule
 * @returns The distinct prefixes
 */
function prefixesOf(rule: InactiveWhenRule): string[] {
  return [...new Set(Object.values(rule.prefixes ?? {}).flat())].filter(
    (prefix): prefix is string => prefix != null,
  );
}

/**
 * Whether a param name starts with a prefix as a whole word, so "Kick" owns
 * "Kick Click" but not "Kickback".
 * @param paramName - Display name of the param
 * @param prefix - The prefix
 * @returns True when the name starts with the prefix and a space
 */
function hasPrefix(paramName: string, prefix: string): boolean {
  return paramName.startsWith(`${prefix} `);
}
