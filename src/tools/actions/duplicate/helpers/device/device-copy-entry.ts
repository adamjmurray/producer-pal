// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

/** A device copy's entry. Its path is added by settleDevicePaths. */
export interface DeviceCopy {
  id: string;
  path?: string;
  /** The rack chains the destination had to make first ("c2-c3") */
  created?: string;
  /** What didn't finish after the device was copied, when something didn't */
  detail?: string;
}

/**
 * Name each copy by where it sits once every copy is made: a later copy
 * inserted ahead of an earlier one pushes it along, and the temp track a copy
 * works through shifts every later track index until it is deleted.
 * @param entries - The call's device entries, copies updated in place
 */
export function settleDevicePaths(entries: DeviceCopy[]): void {
  for (const entry of entries) {
    Object.assign(entry, pathField(LiveAPI.from(entry.id)));
  }
}
