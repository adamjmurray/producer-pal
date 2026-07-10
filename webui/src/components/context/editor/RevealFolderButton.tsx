// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { FolderIcon } from "#webui/components/chat/controls/header/HeaderIcons";
import { getRevealConfigFolderUrl } from "#webui/utils/mcp-url";

/**
 * Header button that opens the ~/.producer-pal config folder in the OS file
 * browser. That folder holds the files behind the Global context, Instructions,
 * Skills, and Memory tabs, so users can edit or manage them directly — which is
 * why it lives in the context editor header rather than the Max device. The
 * browser can't open a native window itself, so this POSTs to the server, which
 * reveals the folder through the Max patch (see reveal-config-dir.ts). Host-local
 * by design: the folder opens on the machine running Producer Pal.
 * @returns The reveal-folder icon button
 */
export function RevealFolderButton(): preact.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => void revealFolder()}
      aria-label="Open config folder"
      title="Open the ~/.producer-pal folder"
      className="shrink-0 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
    >
      <FolderIcon />
    </button>
  );
}

// --- Helpers below main export ---

/**
 * POST the reveal request. Failures are logged, not surfaced: the action is a
 * best-effort convenience, and a remote (non-localhost) browser is refused by
 * design — the folder can only open on the host machine.
 */
async function revealFolder(): Promise<void> {
  try {
    const res = await fetch(getRevealConfigFolderUrl(), { method: "POST" });

    if (!res.ok) {
      console.warn(`Open config folder failed with status ${res.status}`);
    }
  } catch (error) {
    console.warn(`Open config folder request failed: ${String(error)}`);
  }
}
