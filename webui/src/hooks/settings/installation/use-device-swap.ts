// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { fetchJsonOrNull } from "#webui/utils/fetch-json";
import { getDeviceInstallUrl, getDeviceSwapUrl } from "#webui/utils/mcp-url";
import { type DeviceInstallStatus } from "./use-device-install";

/** How often the page asks whether the new device has come up. */
const POLL_MS = 1000;
/** How long one poll may take. */
const POLL_TIMEOUT_MS = 3000;

/** How long it waits for the new device before saying it didn't. */
export const SWAP_TIMEOUT_MS = 45_000;

export const SWAP_TIMED_OUT =
  "The new device didn't answer in time. If Live swapped it, it may be on a different port than this page (3350 is the default): check the device in Live. If the old device is still there, try again.";

/**
 * - `idle`: nothing started.
 * - `waiting`: asked; the old device is going away and the page is watching
 *   for the new one.
 * - `done`: the new device answered from the User Library.
 * - `failed`: refused, or the new device never answered. See `error`.
 */
export type SwapPhase = "idle" | "waiting" | "done" | "failed";

export interface UseDeviceSwapReturn {
  phase: SwapPhase;
  /** Why it failed, or null. */
  error: string | null;
  /** Swap the running device for the copy in `userLibrary`. */
  swap: (userLibrary: string) => void;
}

/**
 * Swaps the running device for the User Library copy.
 *
 * The device that answers this request is the one being replaced, so its
 * server usually dies before it can reply: a dropped connection counts as the
 * swap going ahead. Only a reply that says no is a refusal. The page then polls
 * the status until a device answers that runs from the User Library. Nothing
 * here depends on the old server staying up.
 * @param onSwapped - Called once the new device answers, to re-read the status
 * @returns The phase, the error, and the action
 */
export function useDeviceSwap(onSwapped: () => void): UseDeviceSwapReturn {
  const [phase, setPhase] = useState<SwapPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  // Stops the polling when the tab closes.
  const unmountedRef = useRef(false);
  const onSwappedRef = useRef(onSwapped);

  useEffect(() => {
    onSwappedRef.current = onSwapped;
  });

  useEffect(() => {
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const swap = useCallback((userLibrary: string): void => {
    setPhase("waiting");
    setError(null);

    void (async () => {
      const refusal = await postSwap(userLibrary);

      if (isGone(unmountedRef)) {
        return;
      }

      if (refusal != null) {
        setError(refusal);
        setPhase("failed");

        return;
      }

      const came = await waitForNewDevice(unmountedRef);

      if (isGone(unmountedRef)) {
        return;
      }

      setError(came ? null : SWAP_TIMED_OUT);
      setPhase(came ? "done" : "failed");

      if (came) {
        onSwappedRef.current();
      }
    })();
  }, []);

  return { phase, error, swap };
}

// --- Helpers below main export ---

/**
 * Read the unmount flag after an await. A function, so the type checker doesn't
 * assume it still holds the value it was checked with before the await.
 * @param unmounted - Set when the tab closes
 * @param unmounted.current - Whether the tab has closed
 * @returns Whether the tab has closed
 */
function isGone(unmounted: { current: boolean }): boolean {
  return unmounted.current;
}

/**
 * POST the swap.
 * @param userLibrary - The User Library whose copy to swap in
 * @returns The server's reason when it said no, or null when the swap is going
 *   ahead or the connection dropped (the old server dying with the swap)
 */
async function postSwap(userLibrary: string): Promise<string | null> {
  let response: Response;

  try {
    response = await fetch(getDeviceSwapUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userLibrary }),
    });
  } catch {
    return null;
  }

  if (response.ok) {
    return null;
  }

  return (await readError(response)) ?? `Swap failed (${response.status})`;
}

/**
 * @param response - A refused swap
 * @returns The error its JSON body carries, if it has one
 */
async function readError(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: unknown };

    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

/**
 * Poll until a device answers that runs from the User Library. The old
 * device may still answer for a moment, and nothing answers while the new one
 * starts, so neither ends the wait.
 * @param unmounted - Set when the tab closes
 * @param unmounted.current - Whether the tab has closed
 * @returns True when the new device answered, false on timeout
 */
async function waitForNewDevice(unmounted: {
  current: boolean;
}): Promise<boolean> {
  const started = Date.now();

  while (!isGone(unmounted) && Date.now() - started < SWAP_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));

    const status = await readStatus();

    if (status?.inUserLibrary === true) {
      return true;
    }
  }

  return false;
}

/**
 * Read the status once. A server that takes the connection and never answers
 * must not stall the wait, so a slow read is given up on.
 * @returns The status, or null when nothing answered in time
 */
async function readStatus(): Promise<DeviceInstallStatus | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);

  try {
    return await fetchJsonOrNull<DeviceInstallStatus>(
      getDeviceInstallUrl(),
      controller.signal,
    );
  } finally {
    clearTimeout(timer);
  }
}
