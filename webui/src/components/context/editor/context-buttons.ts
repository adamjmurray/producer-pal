// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared chip-button styling for the context-editor pane controls — Show default
 * / Hide, Copy, and the Skills Preview/Source toggle — so they all read as
 * buttons rather than bare text links. Only the visual chip lives here;
 * layout classes (`justify-self-*`, `shrink-0`) stay at the call site and are
 * prepended, e.g. `` className={`shrink-0 ${CHIP_BUTTON_CLASS}`} ``.
 */
export const CHIP_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors";
