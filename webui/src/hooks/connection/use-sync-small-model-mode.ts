// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from "preact/hooks";

/**
 * Syncs smallModelMode between server and local settings based on conversation lock state.
 * Seeds from server when no active conversation; posts to server when conversation is locked.
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

  useEffect(() => {
    setLocalRef.current = setLocal;
    postRef.current = postToServer;
  });

  useEffect(() => {
    if (activeValue == null) {
      setLocalRef.current(serverValue);
    } else {
      postRef.current(activeValue);
    }
  }, [serverValue, activeValue]);
}
