// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Socket } from "node:net";

// Whether the server is listening beyond this computer right now. The listeners
// set it; request guards read it per request. Kept apart so a guard never needs
// to import the listeners. It follows what is actually bound, not the saved
// setting, so a failed switch or a failed save can't leave it wrong.
let networkAccessAllowed = false;

/** What a switch ended up as. */
export interface SwitchResult {
  /** Whether other computers can connect now. */
  allowNetwork: boolean;
  /** False when a failed switch left nothing listening at all. */
  listening: boolean;
}

/**
 * The request that asked for a switch. Its connection is spared while the
 * switch runs, and the switch waits for `answer` to finish sending, so a
 * queued switch can't cut the connection before the answer is out.
 */
export interface SwitchRequest {
  keep: Socket;
  /** Send the answer; resolve once it is flushed or the connection is gone. */
  answer: (result: SwitchResult) => Promise<void>;
}

/** Re-listens the server. */
export type NetworkSwitcher = (
  allowed: boolean,
  request?: SwitchRequest,
) => Promise<void>;

// How the settings route reaches the listeners, which are started after the
// app is built.
let networkSwitcher: NetworkSwitcher | undefined;

/**
 * Whether other computers can connect right now.
 *
 * @returns True while the server listens on all interfaces
 */
export function isNetworkAccessAllowed(): boolean {
  return networkAccessAllowed;
}

/**
 * Record whether the server listens beyond this computer.
 *
 * @param allowed - True while listening on all interfaces
 */
export function setNetworkAccessAllowed(allowed: boolean): void {
  networkAccessAllowed = allowed;
}

/**
 * Register the function that switches the listeners.
 *
 * @param switcher - The listeners' switch function
 */
export function setNetworkSwitcher(switcher: NetworkSwitcher): void {
  networkSwitcher = switcher;
}

/**
 * Forget a switch function, unless a newer one has replaced it.
 *
 * @param switcher - The function to forget
 */
export function clearNetworkSwitcher(switcher: NetworkSwitcher): void {
  if (networkSwitcher === switcher) {
    networkSwitcher = undefined;
  }
}

/**
 * Turn network access on or off through the listeners, which save the setting
 * and show it on the device. Never rejects.
 *
 * @param allowed - True for all interfaces, false for this computer only
 * @param request - The request to answer once the switch is done
 * @returns False when the server has no listeners to switch (not started)
 */
export async function switchNetworkAccess(
  allowed: boolean,
  request?: SwitchRequest,
): Promise<boolean> {
  if (networkSwitcher == null) {
    return false;
  }

  await networkSwitcher(allowed, request);

  return true;
}
