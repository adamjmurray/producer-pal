// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef, useState } from "preact/hooks";
import {
  type ChatImage,
  type UserMessage,
  type UserMessageInput,
  normalizeUserMessage,
} from "#webui/chat/sdk/types";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat-types";

/** A message waiting to be sent to the AI. */
export interface QueuedMessage {
  id: number;
  text: string;
  /** Images attached to this message, carried through the coalesced turn. */
  images?: ChatImage[];
}

/** A drained queue: the coalesced messages plus the turn-level overrides. */
export interface DrainedQueue {
  messages: QueuedMessage[];
  /**
   * Overrides for the whole coalesced turn, captured once from the message that
   * started the queue (see `enqueueMessage`). Undefined when the queue is empty.
   */
  overrides?: MessageOverrides;
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
  // Overrides (currently just `thinking`) are stamped ONCE per turn — captured
  // from the first message that starts the queue — rather than per message.
  // Queued follow-ups coalesce into a single turn that can carry only one
  // thinking setting, and the toggle is hidden mid-response anyway, so a
  // per-message override would only ever be silently dropped on coalesce.
  // Capturing once makes the data model match what is actually sent.
  const queueOverridesRef = useRef<MessageOverrides | undefined>(undefined);

  const enqueueMessage = useCallback(
    (message: UserMessage, overrides?: MessageOverrides) => {
      if (queueRef.current.length === 0) {
        queueOverridesRef.current = overrides;
      }

      const { text, images } = normalizeUserMessage(message);
      const msg: QueuedMessage = {
        id: nextIdRef.current++,
        text,
        ...(images?.length ? { images } : {}),
      };

      queueRef.current = [...queueRef.current, msg];
      setQueuedMessages(queueRef.current);
    },
    [],
  );

  const removeMessage = useCallback((id: number) => {
    queueRef.current = queueRef.current.filter((m) => m.id !== id);

    // Emptying the queue by hand resets the turn so the next message recaptures.
    if (queueRef.current.length === 0) {
      queueOverridesRef.current = undefined;
    }

    setQueuedMessages(queueRef.current);
  }, []);

  const drainQueue = useCallback((): DrainedQueue => {
    const messages = queueRef.current;
    const overrides = queueOverridesRef.current;

    queueRef.current = [];
    queueOverridesRef.current = undefined;
    setQueuedMessages([]);

    return { messages, overrides };
  }, []);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    queueOverridesRef.current = undefined;
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

/**
 * Coalesce drained queue entries into the single user turn that is actually
 * sent: texts joined by blank lines (blank ones dropped, so an image-only
 * message adds no gap) and every image kept, in queue order.
 * @param queued - The drained queue entries, oldest first
 * @returns The merged message
 */
export function coalesceQueuedMessages(
  queued: QueuedMessage[],
): UserMessageInput {
  const images = queued.flatMap((m) => m.images ?? []);

  return {
    text: queued
      .map((m) => m.text)
      .filter(Boolean)
      .join("\n\n"),
    ...(images.length > 0 ? { images } : {}),
  };
}
