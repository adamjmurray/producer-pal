// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";

/**
 * Refuse a params list with an entry the setter can't read, and return the
 * list with each entry addressed by exactly one of `name` and `id`.
 *
 * An entry with neither a name nor an id, both, no value, or nothing after its
 * last "/" names no one parameter, so there is nothing to write. A blank
 * `name` or `id` counts as absent: the OpenAI models fill the field they don't
 * use with `""` rather than leaving it out. This is the shape a hole in a
 * comma-separated list already gets refused for — and refusing here, before
 * any device is touched, means the caller can fix the list and send it again
 * with nothing to clean up.
 * @param params - The params list as the caller sent it
 * @returns The same entries, trimmed, with the blank addressing field dropped
 */
export function validateParamEntries(
  params: ParamEntry[] | undefined,
): ParamEntry[] | undefined {
  return params?.map((entry, index) => {
    const name = blankToUndefined(entry.name);
    const id = blankToUndefined(entry.id);
    const value = entry.value.trim();
    const key = id ?? name;

    if (key == null) {
      throw new Error(`params entry ${index + 1} has neither a name nor an id`);
    }

    if (name != null && id != null) {
      throw new Error(
        `params entry ${index + 1} has both a name ("${name}") and an id (${id}) — send one`,
      );
    }

    if (value === "") {
      throw new Error(`params entry "${key}" has an empty value`);
    }

    if (
      key.includes("/") &&
      key.slice(key.lastIndexOf("/") + 1).trim() === ""
    ) {
      throw new Error(`params entry "${key}" has an empty name after "/"`);
    }

    return id == null ? { name: key, value } : { id, value };
  });
}

/**
 * @param field - A `name` or `id` as the caller sent it
 * @returns The trimmed field, or undefined when it was missing or blank
 */
function blankToUndefined(field: string | undefined): string | undefined {
  const trimmed = field?.trim();

  return trimmed == null || trimmed === "" ? undefined : trimmed;
}
