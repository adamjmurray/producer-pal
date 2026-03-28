// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Fragment } from "preact";
import { useEffect } from "preact/hooks";
import { type QueuedMessage } from "#webui/hooks/chat/helpers/use-message-queue";

interface QueuedMessagesProps {
  queuedMessages: QueuedMessage[];
  onRemove: (id: number) => void;
  scrollRef: { current: HTMLDivElement | null };
}

/**
 * Renders queued user messages with a dimmed style and "queued" label.
 * Auto-scrolls into view when new messages are queued.
 * @param props - Component props
 * @param props.queuedMessages - Messages waiting to be sent
 * @param props.onRemove - Callback to remove a queued message by id
 * @param props.scrollRef - Ref to scroll target element
 * @returns Queued message bubbles
 */
export function QueuedMessages({
  queuedMessages,
  onRemove,
  scrollRef,
}: QueuedMessagesProps) {
  useEffect(() => {
    if (queuedMessages.length > 0) {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [queuedMessages, scrollRef]);

  return (
    <>
      {queuedMessages.map((qm) => (
        <Fragment key={qm.id}>
          <div />
          <div className="text-black bg-blue-100 dark:text-white dark:bg-blue-900/80 shadow-sm dark:shadow-white/10 dark:border dark:border-blue-700/40 min-w-0 rounded-lg py-0.5 px-3 opacity-60">
            <div className="flex items-start justify-between gap-2">
              <p className="whitespace-pre-wrap">{qm.text}</p>
              <button
                onClick={() => onRemove(qm.id)}
                className="shrink-0 mt-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs leading-none"
                aria-label="Remove queued message"
              >
                ✕
              </button>
            </div>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              queued
            </span>
          </div>
          <div />
        </Fragment>
      ))}
    </>
  );
}
