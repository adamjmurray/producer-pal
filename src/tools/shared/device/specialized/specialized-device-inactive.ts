// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
 * Apply sibling-driven inactivity rules to an already-read parameter list,
 * marking params `state: "inactive"` when a controller param's current value
 * makes them irrelevant (see `SpecializedDeviceSpec.inactiveWhen`). Mutates the
 * entries in place. Reuses the values already read for the response, so it adds
 * no Live API calls.
 *
 * Degrades gracefully: a controller absent from `parameters` (e.g. filtered out
 * by a param search) skips its rule, and an existing non-active state set by
 * Live is never overwritten.
 * @param rules - The device's inactivity rules
 * @param parameters - Parameter entries from the reader (mutated in place)
 */
export function applyInactiveStates(
  rules: InactiveWhenRule[],
  parameters: Record<string, unknown>[],
): void {
  const byName = new Map<string, Record<string, unknown>>();

  for (const param of parameters) {
    if (typeof param.name === "string") {
      byName.set(param.name, param);
    }
  }

  for (const rule of rules) {
    const controller = byName.get(rule.controller);

    if (controller == null) continue;

    const inactiveNames = rule.cases[String(controller.value)];

    if (inactiveNames == null) continue;

    for (const name of inactiveNames) {
      const target = byName.get(name);

      // Only set when present and Live hasn't already assigned a state
      // (inactive/disabled) — Live's own greying-out takes precedence.
      if (target != null && target.state == null) {
        target.state = "inactive";
      }
    }
  }
}
