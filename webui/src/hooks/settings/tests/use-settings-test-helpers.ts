// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { act } from "@testing-library/preact";

/**
 * Flush the post-mount async decrypt-load so it can't clobber later edits.
 * The load chain is several microtask hops (loadAllProviderSettingsAsync →
 * Promise.all → applyLoadedSettings), so yield several rounds inside act.
 * Shared by use-settings.test.ts and use-settings-notation.test.ts.
 */
export async function flushLoad(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}
