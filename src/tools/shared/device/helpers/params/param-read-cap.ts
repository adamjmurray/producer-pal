// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type EntryWithDetail,
  appendDetail,
} from "#src/tools/shared/helpers/entry-details.ts";

/** Most params one device read lists. A search narrows to the rest. */
export const MAX_READ_PARAMS = 200;

/**
 * Say a device read stopped short of the device's params.
 * @param deviceInfo - The device's entry, which gets `paramCount` and a note
 * @param total - How many params matched
 */
export function noteParamsCapped(
  deviceInfo: EntryWithDetail & Record<string, unknown>,
  total: number,
): void {
  if (total <= MAX_READ_PARAMS) {
    return;
  }

  deviceInfo.paramCount = total;
  appendDetail(
    deviceInfo,
    `listing the first ${MAX_READ_PARAMS} params; narrow with paramSearch`,
  );
}
