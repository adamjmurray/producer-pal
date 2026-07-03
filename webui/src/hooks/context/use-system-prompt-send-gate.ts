// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef } from "preact/hooks";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat-types";
import { type DocMemoryStatus } from "#webui/hooks/context/use-doc-memory";

type SendFn = (message: string, options?: MessageOverrides) => Promise<void>;

/**
 * Defer a chat send until the custom system-prompt document has finished its
 * mount-time load. The instruction is locked on the first send (see useChat's
 * initializeChat), resolving the override from whatever value is current then;
 * while the `/system-prompt` fetch is still in flight that value is a provisional
 * "" (built-in). A first turn fired inside that window would therefore lock the
 * built-in prompt and keep using it even after the real override loads. Waiting
 * out the "loading" status closes the race — mirroring how initializeChat already
 * awaits validateMcpConnection before locking.
 *
 * Once the status has resolved (ready OR error — an unreadable route means there
 * is no override to honor, so built-in is correct) the gate is transparent: it
 * returns immediately and never delays a later send.
 *
 * The send is invoked through a ref so the call made after the await uses the
 * latest handler — by then a status change has re-rendered the chat hook with the
 * loaded override in its extraParams, so the captured closure isn't stale.
 *
 * @param status - The system-prompt document's load status
 * @param send - The underlying send handler to gate
 * @returns A send handler that waits out the initial load before sending
 */
export function useSystemPromptSendGate(
  status: DocMemoryStatus,
  send: SendFn,
): SendFn {
  // Latest-value refs (updated in effects, not during render): the gated
  // callback is stable but reads the current status/handler when a send fires.
  const isLoadingRef = useRef(status.kind === "loading");
  const sendRef = useRef(send);
  const waitersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    isLoadingRef.current = status.kind === "loading";

    if (status.kind === "loading") return;

    // Resolved (ready or error): release any sends queued during the load. They
    // resume as microtasks after this effect pass, by which point sendRef points
    // at the handler from the render that carries the loaded override.
    const waiters = waitersRef.current;

    waitersRef.current = [];
    for (const resolve of waiters) resolve();
  }, [status.kind]);

  return useCallback(async (message: string, options?: MessageOverrides) => {
    if (isLoadingRef.current) {
      await new Promise<void>((resolve) => waitersRef.current.push(resolve));
    }

    await sendRef.current(message, options);
  }, []);
}
