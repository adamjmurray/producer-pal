// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// How a caller is told to get the plug-in host wrappers into Live's browser.
// They come with the Producer Pal install, so this follows the remote script's
// setup wording.

import {
  INSTALL_IN_CHAT_UI,
  INSTALL_WITH_TOOL,
} from "#src/tools/shared/remote-script/remote-script-setup.ts";

/**
 * What to tell the model when a hosted call needs a wrapper that Live's
 * browser doesn't have.
 * @param manage - Whether the caller can use ppal-manage
 * @returns The setup steps, as the rest of "...isn't installed; <steps>"
 */
export function pluginHostSetup(manage: boolean): string {
  const install = manage
    ? `install it with ${INSTALL_WITH_TOOL} (or have the user use ${INSTALL_IN_CHAT_UI})`
    : `have the user install it in ${INSTALL_IN_CHAT_UI}`;

  return `${install}. Live's browser can take a few seconds to see a new file, so retry after a short wait if it was just installed`;
}
