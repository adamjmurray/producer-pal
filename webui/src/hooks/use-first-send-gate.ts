// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef } from "preact/hooks";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat-types";

type SendFn = (message: string, options?: MessageOverrides) => Promise<void>;

/**
 * Defer a chat send while any value the first turn will LOCK is still loading.
 * useChat's initializeChat locks the system instruction and the notation from
 * whatever is current at the first send, and both are fetched on mount:
 *
 * - the custom system prompt (`/system-prompt`) — provisionally "" (built-in),
 *   so a turn fired inside the fetch window locks the built-in prompt and keeps
 *   using it even after the user's real override loads;
 * - the notation (`/config`) — provisionally DEFAULT_NOTATION, so a user whose
 *   device is set to another notation gets a conversation locked to the wrong
 *   grammar for its entire life, teaching the model one notation while their
 *   clips are written in another. Nothing else catches this: the provisional
 *   value is itself a perfectly valid notation, and no error surfaces.
 *
 * Waiting out the load closes both races — mirroring how initializeChat already
 * awaits validateMcpConnection before locking.
 *
 * Once nothing is loading the gate is transparent: it returns immediately and
 * never delays a later send. "Loaded" deliberately includes failure (an
 * unreadable route means there is no override to honor and no server notation to
 * read, so the provisional value is the right answer) — otherwise an unreachable
 * server would park the first send forever.
 *
 * The send is invoked through a ref so the call made after the await uses the
 * latest handler — by then the resolved value has re-rendered the chat hook into
 * its extraParams, so the captured closure isn't stale. That is also why callers
 * must derive `isLoading` from state that updates in the SAME render as the value
 * it guards (see `notationKnown` in useSettings): a flag that flips a render
 * early would release the send before the value it was waiting for arrived.
 *
 * @param isLoading - Whether any first-send-locked value is still resolving
 * @param send - The underlying send handler to gate
 * @returns A send handler that waits out the initial load before sending
 */
export function useFirstSendGate(isLoading: boolean, send: SendFn): SendFn {
  // Latest-value refs (updated in effects, not during render): the gated
  // callback is stable but reads the current flag/handler when a send fires.
  const isLoadingRef = useRef(isLoading);
  const sendRef = useRef(send);
  const waitersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    isLoadingRef.current = isLoading;

    if (isLoading) return;

    // Everything resolved: release any sends queued during the load. They resume
    // as microtasks after this effect pass, by which point sendRef points at the
    // handler from the render that carries the loaded values.
    const waiters = waitersRef.current;

    waitersRef.current = [];
    for (const resolve of waiters) resolve();
  }, [isLoading]);

  // On unmount, release any still-parked sends so a caller awaiting the gate
  // can't hang forever when the load never resolves before teardown.
  useEffect(
    () => () => {
      const waiters = waitersRef.current;

      waitersRef.current = [];
      for (const resolve of waiters) resolve();
    },
    [],
  );

  return useCallback(async (message: string, options?: MessageOverrides) => {
    if (isLoadingRef.current) {
      await new Promise<void>((resolve) => waitersRef.current.push(resolve));
    }

    await sendRef.current(message, options);
  }, []);
}
