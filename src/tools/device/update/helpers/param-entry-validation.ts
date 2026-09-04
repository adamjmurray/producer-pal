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
 * @param params - The params list as the caller sent it
 * @param toolName - Tool name for the error message
 */
export function validateParamEntries(
  params: ParamEntry[] | undefined,
  toolName: string,
): void {
  for (const [index, entry] of (params ?? []).entries()) {
    const key = entry.name.trim();

    if (key === "") {
      throw new Error(
        `${toolName} failed: params entry ${index + 1} has an empty name`,
      );
    }

    if (entry.value.trim() === "") {
      throw new Error(
        `${toolName} failed: params entry "${key}" has an empty value`,
      );
    }

    if (
      key.includes("/") &&
      key.slice(key.lastIndexOf("/") + 1).trim() === ""
    ) {
      throw new Error(
        `${toolName} failed: params entry "${key}" has an empty name after "/"`,
      );
    }
  }
}
