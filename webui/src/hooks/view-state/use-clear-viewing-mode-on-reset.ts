// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from "preact/hooks";

/**
 * Clears a pinned foreign-mode view override when the active conversation is
 * reset to a fresh session — i.e. when the active id transitions from set to
 * null. A delete that removes the record currently being viewed (single or
 * bulk) nulls the active id; without this the user is stranded in the foreign
 * mode's fresh session instead of falling back to their saved mode.
 *
 * The set → null transition is the precise signal: the delete paths only null
 * the active id when the active record was actually removed (bulk-unbookmarked
 * leaves a bookmarked active record alone), and opening a foreign record sets
 * the id non-null before pinning viewingMode, so this never fires spuriously.
 * "New conversation" clears the override directly too — the redundant clear here
 * is harmless.
 *
 * @param activeConversationId - The mode's current active conversation id
 * @param clearViewingMode - Drops the foreign-mode view override
 */
export function useClearViewingModeOnReset(
  activeConversationId: string | null,
  clearViewingMode: () => void,
): void {
  const prevIdRef = useRef(activeConversationId);

  useEffect(() => {
    if (prevIdRef.current != null && activeConversationId == null) {
      clearViewingMode();
    }

    prevIdRef.current = activeConversationId;
  }, [activeConversationId, clearViewingMode]);
}
