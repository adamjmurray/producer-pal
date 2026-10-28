// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

export const TAB_IDS = [
  "connection",
  "presets",
  "tools",
  "installation",
  "preferences",
] as const;

export type TabId = (typeof TAB_IDS)[number];

/**
 * @param value - Any string, such as a URL parameter
 * @returns Whether it names a settings tab
 */
export function isTabId(value: string): value is TabId {
  return (TAB_IDS as readonly string[]).includes(value);
}
