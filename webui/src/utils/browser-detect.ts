// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Detect Firefox by user-agent string. The voice prototype uses WebRTC in a
 * way that Firefox handles inconsistently, so we currently only support
 * Chromium-based browsers for voice. Firefox does not impersonate other
 * browsers in its UA, so a substring check is reliable enough for a "show a
 * warning" gate.
 *
 * @returns true when the current browser is Firefox
 */
export function isFirefox(): boolean {
  if (typeof navigator === "undefined") return false;

  return navigator.userAgent.includes("Firefox");
}
