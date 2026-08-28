// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef } from "preact/hooks";

interface StreamEndAutosaveParams {
  isAssistantResponding: boolean;
  autoSaveRef: { current: (() => void) | null };
  clearConversation: () => void;
}

/**
 * Saves a conversation when its stream ends — including when the stream ends
 * because the user left mid-response.
 *
 * A stream ending is only visible from a deferred effect, and by the time that
 * effect runs a user who left has already torn the conversation down: the
 * client and its history are gone, and another conversation is active. So the
 * save would find nothing to write (New) or write under the wrong id (Switch),
 * either way losing the tail of what was streaming.
 *
 * The fix is to save from the teardown itself, on the way out, while the
 * history and the id still belong together. The effect then stands down for
 * any stream that was torn down under it — otherwise it would fire a second,
 * late save that stamps whichever conversation the user moved to as
 * just-updated.
 *
 * Deleting is not a special case here: the delete marks the conversation
 * before tearing it down, and the store refuses a save for a deleted one.
 * @param params - Hook inputs
 * @param params.isAssistantResponding - Whether a stream is in flight
 * @param params.autoSaveRef - Ref to the conversation auto-save callback
 * @param params.clearConversation - Tears down the live conversation
 * @returns The teardown to hand to useConversations, saving as it goes
 */
export function useStreamEndAutosave(
  params: StreamEndAutosaveParams,
): () => void {
  const { isAssistantResponding, autoSaveRef, clearConversation } = params;
  // Bumped by every teardown.
  const teardownGenRef = useRef(0);
  // The teardown generation the in-flight stream started under, or null when
  // nothing is streaming. Comparing it on the way out is what distinguishes a
  // stream that ran to its end from one the user walked away from.
  const streamGenRef = useRef<number | null>(null);

  useEffect(() => {
    if (isAssistantResponding) {
      streamGenRef.current = teardownGenRef.current;

      return;
    }

    const streamGen = streamGenRef.current;

    streamGenRef.current = null;

    // Nothing was streaming, or what was streaming has since been torn down —
    // and the teardown already saved it.
    if (streamGen == null || streamGen !== teardownGenRef.current) return;

    autoSaveRef.current?.();
  }, [isAssistantResponding, autoSaveRef]);

  return useCallback(() => {
    if (streamGenRef.current != null) autoSaveRef.current?.();

    teardownGenRef.current++;
    clearConversation();
  }, [autoSaveRef, clearConversation]);
}
