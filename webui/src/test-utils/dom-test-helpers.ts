// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { act } from "@testing-library/preact";

/**
 * Dispatch a `hashchange` event inside act() and yield long enough for any
 * debounced hash watcher to react. Used by hooks that read `window.location.hash`
 * to drive conversation/voice routing.
 */
export async function fireHashChange(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await new Promise((r) => setTimeout(r, 50));
  });
}
