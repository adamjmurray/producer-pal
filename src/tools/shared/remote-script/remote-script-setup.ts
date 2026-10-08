// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// How a caller is told to get the Producer Pal remote script running. One
// wording, so every feature that needs it sends the model the same way.

/** The tool call that installs it. */
export const INSTALL_WITH_TOOL = 'ppal-manage action "install-remote-script"';

/** Where the user installs it by hand. */
export const INSTALL_IN_CHAT_UI =
  "the Producer Pal chat UI's Settings → Remote Script";

/** What to tell the user when a load needs the remote script. */
export const REMOTE_SCRIPT_SETUP = `set it up with ${INSTALL_WITH_TOOL}, then ask the user to restart Live (or have them use ${INSTALL_IN_CHAT_UI}; guide: https://producer-pal.org/guide/remote-script)`;
