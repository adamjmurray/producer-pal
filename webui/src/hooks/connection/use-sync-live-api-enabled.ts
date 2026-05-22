// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from "preact/hooks";

/**
 * Seeds modal-local liveApiEnabled from the server value. Skipped when
 * the user has touched the toggle (dirty=true) so their intent isn't
 * overwritten. The /config focus-refetch in useRemoteConfig picks up
 * device Setup-tab toggle changes; this effect propagates them into the
 * modal-local state, even while the modal is open, as long as the user
 * hasn't explicitly toggled.
 *
 * The save handler uses the dirty flag to decide whether to POST, so a
 * device-side change that arrives while the modal is open will not be
 * silently overwritten on save (the user-edit case still wins).
 *
 * @param serverValue - Server-fetched liveApiEnabled value
 * @param dirty - Whether the user has toggled the modal-local value
 * @param seed - Setter that updates local state without marking dirty
 */
export function useSyncLiveApiEnabled(
  serverValue: boolean,
  dirty: boolean,
  seed: (enabled: boolean) => void,
): void {
  useEffect(() => {
    if (!dirty) {
      seed(serverValue);
    }
  }, [serverValue, dirty, seed]);
}
