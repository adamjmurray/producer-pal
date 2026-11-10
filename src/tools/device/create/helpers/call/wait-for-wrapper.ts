// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { waitUntil } from "#src/shared/max/v8-wait-until.ts";
import {
  hostedPluginFromInfo,
  isDefaultWrapperName,
} from "#src/tools/shared/device/helpers/params/hosted-plugin-reading.ts";
import { type BrowserItem } from "../remote-script-contract.ts";

/** How often to ask a new wrapper whether it is up. */
const POLL_MS = 100;

/** The longest to wait for it. It starts answering a moment after it loads. */
const WRAPPER_WAIT_MS = 5000;

/**
 * Whether a browser item is a Producer Pal wrapper, by the name Live's browser
 * gave it, not the one the call typed.
 * @param item - What Live's browser resolved
 * @returns True for a wrapper
 */
export function isWrapperItem(item: BrowserItem): boolean {
  return isDefaultWrapperName(item.name);
}

/**
 * Wait for a just-loaded wrapper to answer. Until it does it can't be told
 * from a Max device that isn't one.
 * @param deviceId - Live id of the wrapper
 * @param deadline - The request deadline, if any
 * @returns False when it never answered in time
 */
export async function waitForWrapper(
  deviceId: string,
  deadline: number | null | undefined,
): Promise<boolean> {
  const waitMs =
    deadline == null
      ? WRAPPER_WAIT_MS
      : Math.min(WRAPPER_WAIT_MS, deadline - Date.now());

  return await waitUntil(() => hostedPluginFromInfo(deviceId) != null, {
    pollingInterval: POLL_MS,
    maxRetries: Math.max(1, Math.ceil(waitMs / POLL_MS)),
  });
}
