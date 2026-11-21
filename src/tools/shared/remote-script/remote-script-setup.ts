// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// How a caller is told to get the Producer Pal remote script running. One
// wording, so every feature that needs it sends the model the same way.

/** The tool call that installs it, along with the device. */
export const INSTALL_WITH_TOOL = 'ppal-manage action "install-producer-pal"';

/** What the remote script adds, for a model deciding whether to suggest it. */
export const REMOTE_SCRIPT_ADDS =
  "It adds clip automation, loading plug-ins, Max for Live devices and presets, audio-to-MIDI conversion, and undo/redo with one undo step per tool call.";

/** Where the user installs it by hand. */
export const INSTALL_IN_CHAT_UI =
  "the Producer Pal chat UI's Settings → Installation";

/**
 * What the user does in Live after an install. Live only scans Remote Scripts
 * at startup, so the restart comes first: neither step works alone.
 */
export const ENABLE_IN_LIVE =
  "restart Live, then choose Producer Pal as a Control Surface in Settings → Tempo & MIDI, with Input and Output left as None";

/**
 * Whether this request's caller can use ppal-manage, which decides if a refusal
 * may name it. The device fills `manageAvailable` per request from the caller's
 * toolset; a context without it (no profile) falls back to small-model mode.
 * @param context - The request's tool context
 * @returns True when a message may point at ppal-manage
 */
export function manageOffered(context: {
  manageAvailable?: boolean;
  smallModelMode?: boolean;
}): boolean {
  return context.manageAvailable ?? !context.smallModelMode;
}

/**
 * What to tell the model when a call needs the remote script. A caller without
 * ppal-manage is sent to the human path only.
 * @param manage - Whether the caller can use ppal-manage
 * @returns The setup steps, as the rest of "...which isn't answering; <steps>"
 */
export function remoteScriptSetup(manage: boolean): string {
  const guide = "guide: https://producer-pal.org/guide/remote-script";

  return manage
    ? `set it up with ${INSTALL_WITH_TOOL} if it isn't installed, then ask the user to ${ENABLE_IN_LIVE} (or have them use ${INSTALL_IN_CHAT_UI}; ${guide})`
    : `have the user install it in ${INSTALL_IN_CHAT_UI} if it isn't installed, then ${ENABLE_IN_LIVE} (${guide})`;
}
