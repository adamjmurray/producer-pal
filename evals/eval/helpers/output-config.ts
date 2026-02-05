// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Output configuration for eval scripts
 */

let quietMode = false;

/**
 * Set quiet mode for eval output
 *
 * @param value - Whether to enable quiet mode
 */
export function setQuietMode(value: boolean): void {
  quietMode = value;
}

/**
 * Check if quiet mode is enabled
 *
 * @returns Whether quiet mode is enabled
 */
export function isQuietMode(): boolean {
  return quietMode;
}
