// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Name the fields whose parameter has an arrangement lane, marking the ones the
 * user overrode. Only meaningful while the owning track follows the
 * arrangement; elsewhere `automation_state` reads 0 whatever the lane holds.
 * @param automatable - Each field's name, as the result names it, with its
 *   parameter. A name may be a function, called only for an automated field.
 * @returns Names of the automated fields, ` (overridden)` after an overridden one
 */
export function automatedFieldNames(
  automatable: Array<[string | (() => string), LiveAPI]>,
): string[] {
  return automatable.flatMap(([name, param]) => {
    const state = param.getProperty("automation_state");

    if (state !== 1 && state !== 2) {
      return [];
    }

    const label = typeof name === "function" ? name() : name;

    return [state === 1 ? label : `${label} (overridden)`];
  });
}
