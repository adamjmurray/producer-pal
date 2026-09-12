// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { select, type SelectArgs } from "#src/tools/session/select.ts";

/**
 * Move the focus for a tool that has already done its work.
 *
 * `select` throws on an id it can't resolve, and a create or update tool
 * focuses its result after the objects exist. Letting that out would report the
 * whole call as an error with no record of what was made, so a focus that fails
 * warns and the call still succeeds.
 * @param args - What to select
 */
export function focusSelect(args: SelectArgs): void {
  try {
    select(args);
  } catch (error) {
    console.warn(`Could not move the focus: ${errorMessage(error)}`);
  }
}
