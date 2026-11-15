// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type EntryWithDetail,
  appendDetail,
} from "#src/tools/shared/helpers/entry-details.ts";

/** Most params one device read lists. `paramOffset` pages to the rest. */
export const MAX_READ_PARAMS = 200;

/**
 * Say which slice of the device's params a read listed, when it isn't all of
 * them. A read that fits on one page from the start says nothing.
 * @param deviceInfo - The device's entry, which gets `paramCount` and a note
 * @param total - How many params matched
 * @param offset - How many matches the read skipped
 */
export function noteParamsPaged(
  deviceInfo: EntryWithDetail & Record<string, unknown>,
  total: number,
  offset: number,
): void {
  const end = Math.min(offset + MAX_READ_PARAMS, total);

  if (offset === 0 && end === total) {
    return;
  }

  deviceInfo.paramCount = total;

  if (offset >= total) {
    appendDetail(
      deviceInfo,
      `paramOffset ${offset} is past the last param (${total})`,
    );

    return;
  }

  const shown = `listing params ${offset + 1}-${end} of ${total}`;

  appendDetail(
    deviceInfo,
    end < total
      ? `${shown}; pass paramOffset: ${end} for more, or narrow with paramSearch`
      : shown,
  );
}
