// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from "preact/hooks";

/**
 * Run a read on mount and abort it on the way out, so a response that lands
 * after the component is gone (or after a newer read superseded it) can't set
 * state. The loader is the effect's whole dependency: memoize it over what it
 * reads and it re-runs exactly when that changes.
 * @param load - Memoized loader, given this run's abort signal
 */
export function useAbortableLoad(
  load: (signal: AbortSignal) => Promise<void>,
): void {
  useEffect(() => {
    const controller = new AbortController();

    void load(controller.signal);

    return () => controller.abort();
  }, [load]);
}
