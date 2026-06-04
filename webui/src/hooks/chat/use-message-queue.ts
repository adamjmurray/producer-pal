// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef, useState } from "preact/hooks";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat-types";

/** A message waiting to be sent to the AI. */
export interface QueuedMessage {
  id: number;
  text: string;
  overrides?: MessageOverrides;
  timestamp: number;
}

/**
 * Hook for queuing user messages while the AI is responding.
 * Provides both state (for UI rendering) and a ref (for synchronous reads in callbacks).
 * @returns Queue state and mutation functions
 */
export function useMessageQueue() {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const queueRef = useRef<QueuedMessage[]>([]);
  const nextIdRef = useRef(0);

  const enqueueMessage = useCallback(
    (text: string, overrides?: MessageOverrides) => {
      const msg: QueuedMessage = {
        id: nextIdRef.current++,
        text,
        overrides,
        timestamp: Date.now(),
      };

      queueRef.current = [...queueRef.current, msg];
      setQueuedMessages(queueRef.current);
    },
    [],
  );

  const removeMessage = useCallback((id: number) => {
    queueRef.current = queueRef.current.filter((m) => m.id !== id);
    setQueuedMessages(queueRef.current);
  }, []);

  const drainQueue = useCallback((): QueuedMessage[] => {
    const all = queueRef.current;

    queueRef.current = [];
    setQueuedMessages([]);

    return all;
  }, []);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    setQueuedMessages([]);
  }, []);

  return {
    queuedMessages,
    queueRef,
    enqueueMessage,
    removeMessage,
    drainQueue,
    clearQueue,
  };
}
