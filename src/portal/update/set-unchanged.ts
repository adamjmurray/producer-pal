// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * What an update that stopped before the swap left behind.
 * @param libraryUpdated - Whether this update wrote the device file into the
 *   User Library
 * @returns A sentence for the failure message
 */
export function setUnchanged(libraryUpdated: boolean): string {
  return libraryUpdated
    ? "The Live Set wasn't changed, but the Producer Pal device in the User Library was updated."
    : "The Live Set wasn't changed.";
}
