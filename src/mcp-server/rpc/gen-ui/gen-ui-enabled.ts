// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Whether this build has the experimental generative UI (`ENABLE_GEN_UI=true`).
 * A release build never does: the tool, the routes and the stream are all off.
 * @returns True when the flag is on
 */
export function isGenUiEnabled(): boolean {
  return process.env.ENABLE_GEN_UI === "true";
}
