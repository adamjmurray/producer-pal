// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Whether the server is listening beyond this computer right now. The listeners
// set it; request guards read it per request. Kept apart so a guard never needs
// to import the listeners. It follows what is actually bound, not the saved
// setting, so a failed switch or a failed save can't leave it wrong.
let networkAccessAllowed = false;

/**
 * Whether other devices can connect right now.
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
