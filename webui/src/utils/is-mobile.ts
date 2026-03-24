// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Check if viewport is below Tailwind's md breakpoint (768px)
 * @returns true on mobile-width screens
 */
export function isMobile(): boolean {
  return window.matchMedia("(max-width: 767px)").matches;
}
