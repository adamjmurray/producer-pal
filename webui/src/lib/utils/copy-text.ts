// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** `document`, narrowed to the one deprecated method used here. */
interface LegacyCopyDocument {
  execCommand: (command: string) => boolean;
}

/**
 * Copy text to the clipboard. Tries `navigator.clipboard`, which browsers leave
 * out on plain-HTTP pages (the chat UI is served over HTTP on a LAN), then falls
 * back to selecting a hidden textarea and running the `copy` command.
 * @param text - Text to copy
 * @returns True if the text was copied
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard as Clipboard | undefined;

  if (clipboard != null) {
    try {
      await clipboard.writeText(text);

      return true;
    } catch {
      // Denied or unavailable; try the older way.
    }
  }

  return copyWithSelection(text);
}

/**
 * Copy via a hidden textarea and `document.execCommand("copy")`.
 * @param text - Text to copy
 * @returns True if the browser ran the copy
 */
function copyWithSelection(text: string): boolean {
  const previous = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");

  area.value = text;
  area.readOnly = true;
  area.setAttribute("aria-hidden", "true");
  area.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
  document.body.appendChild(area);

  try {
    area.focus();
    area.select();

    // Deprecated, but the only copy that works without a secure context.
    return (document as LegacyCopyDocument).execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    previous?.focus();
  }
}
