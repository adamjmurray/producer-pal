// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from "preact/hooks";

/**
 * Syncs smallModelMode between server and local settings based on conversation lock state.
 * Two independent effects:
 * - Seed: updates local from server when server value changes and no conversation is active
 * - Post: sends locked value to server when a conversation starts or its SMM changes
 * Split to prevent the post effect from undoing a settings save while a conversation is active.
 * @param serverValue - Server-fetched smallModelMode value
 * @param activeValue - Conversation-locked value (null when no active conversation)
 * @param setLocal - Setter for local settings state
 * @param postToServer - Function to POST value to server
 */
export function useSyncSmallModelMode(
  serverValue: boolean,
  activeValue: boolean | null,
  setLocal: (enabled: boolean) => void,
  postToServer: (enabled: boolean) => void,
): void {
  const setLocalRef = useRef(setLocal);
  const postRef = useRef(postToServer);
  const activeValueRef = useRef(activeValue);

  useEffect(() => {
    setLocalRef.current = setLocal;
    postRef.current = postToServer;
    activeValueRef.current = activeValue;
  });

  // Seed local from server when server value changes (only if no active conversation)
  useEffect(() => {
    if (activeValueRef.current == null) {
      setLocalRef.current(serverValue);
    }
  }, [serverValue]);

  // Post locked value to server when conversation starts or its SMM changes
  useEffect(() => {
    if (activeValue != null) {
      postRef.current(activeValue);
    }
  }, [activeValue]);
}
