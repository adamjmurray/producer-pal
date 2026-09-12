// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";

/**
 * Refuse a params list with an entry the setter can't read.
 *
 * An entry with no name, no value, or nothing after its last "/" names no
 * parameter, so there is nothing to write. This is the shape a hole in a
 * comma-separated list already gets refused for — and refusing here, before
 * any device is touched, means the caller can fix the list and send it again
 * with nothing to clean up.
 *
 * A name repeated in the same list is refused too: values are read back once
 * after every write in the call lands, keyed by the param it resolved to, so
 * an earlier write to the same param is never observable — its result entry
 * would report a value that write never produced.
 * @param params - The params list as the caller sent it
 */
export function validateParamEntries(params: ParamEntry[] | undefined): void {
  const seen = new Set<string>();

  for (const [index, entry] of (params ?? []).entries()) {
    const key = entry.name.trim();

    if (key === "") {
      throw new Error(`params entry ${index + 1} has an empty name`);
    }

    if (entry.value.trim() === "") {
      throw new Error(`params entry "${key}" has an empty value`);
    }

    if (
      key.includes("/") &&
      key.slice(key.lastIndexOf("/") + 1).trim() === ""
    ) {
      throw new Error(`params entry "${key}" has an empty name after "/"`);
    }

    const dedupeKey = key.toLowerCase();

    if (seen.has(dedupeKey)) {
      throw new Error(`params entry "${key}" is set more than once`);
    }

    seen.add(dedupeKey);
  }
}
