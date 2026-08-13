// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from "preact/hooks";

/**
 * Seeds a modal-local setting from its server value. Skipped when the user has
 * touched the control (dirty=true) so their intent isn't overwritten. The
 * /config focus-refetch in useRemoteConfig picks up device Setup-pane changes;
 * this effect propagates them into the modal-local state, even while the modal
 * is open, as long as the user hasn't explicitly edited.
 *
 * The save handler uses the dirty flag to decide whether to POST, so a
 * device-side change that arrives while the modal is open will not be silently
 * overwritten on save (the user-edit case still wins). Used for both
 * liveApiEnabled (boolean) and notation (enum).
 *
 * A nullish `serverValue` means "not known yet" (the mount-time fetch hasn't
 * answered), not "seed a blank". It is skipped so the caller's local state keeps
 * whatever provisional value it started with and its own "has this been seeded"
 * flag stays false — which is what lets useFirstSendGate hold a chat's first
 * turn until the real notation is in hand. `false` is a value, not nullish, so
 * the boolean callers are unaffected.
 *
 * @param serverValue - Server-fetched value, or null/undefined if not yet known
 * @param dirty - Whether the user has edited the modal-local value
 * @param seed - Setter that updates local state without marking dirty
 */
export function useSyncServerSetting<T>(
  serverValue: T | null | undefined,
  dirty: boolean,
  seed: (value: T) => void,
): void {
  useEffect(() => {
    if (!dirty && serverValue != null) {
      seed(serverValue);
    }
  }, [serverValue, dirty, seed]);
}
