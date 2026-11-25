// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** Session-storage key holding the source of an app to preview. */
export const PREVIEW_APP_SOURCE_KEY = "producer_pal_gen_app_source";

/** Fired on `window` after the stored source changes, so the panel re-reads it. */
export const PREVIEW_APP_SOURCE_EVENT = "producer_pal_gen_app_source_changed";

/**
 * Temporary seam until the AI can create apps: a test puts an app's source in
 * session storage for the gen panel to run. Remove when apps come from the AI.
 *
 * @returns The app source to preview, or null when none is set
 */
export function readPreviewAppSource(): string | null {
  try {
    return sessionStorage.getItem(PREVIEW_APP_SOURCE_KEY);
  } catch {
    return null;
  }
}
