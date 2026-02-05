// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type declarations for Rollup/Vite virtual modules.
 * These are generated at build time and don't exist as real files.
 */

/** Virtual module containing the chat UI HTML as a string */
declare module "virtual:chat-ui-html" {
  const html: string;
  export default html;
}
