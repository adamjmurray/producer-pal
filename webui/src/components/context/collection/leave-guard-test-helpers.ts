// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type LeaveGuard } from "#webui/components/context/collection/leave-guard";

/**
 * A real ref-backed leave guard (matching `useLeaveGuard`), so the editor that
 * registers a discard-confirm and whatever calls confirmLeave share one
 * registry — the same wiring ContextTabs provides in the app.
 * @returns A leave guard for a test provider
 */
export function makeManualGuard(): LeaveGuard {
  let registered: (() => boolean) | null = null;

  return {
    register: (guard) => {
      registered = guard;
    },
    confirmLeave: () => registered == null || registered(),
  };
}
