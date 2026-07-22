// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type DocMemoryStatus,
  type SaveStatus,
} from "#webui/hooks/context/use-doc-memory";

interface SaveIndicatorProps {
  status: DocMemoryStatus;
  saveStatus: SaveStatus;
  dirty: boolean;
}

/**
 * Small text indicator describing the editor's read/write availability and
 * the most recent save outcome. Rendered in the context editor header.
 * @param props - Indicator props
 * @returns Indicator element
 */
export function SaveIndicator(props: SaveIndicatorProps): preact.JSX.Element {
  const { text, className } = saveIndicatorLabel(props);

  // Never wrap: a narrow window would otherwise break "Auto-save on" across
  // three lines and stretch the header. The tab strip scrolls instead.
  return (
    <span className={`text-xs whitespace-nowrap ${className}`}>{text}</span>
  );
}

/**
 * Resolve the indicator's text + color for the current read/save state. Order
 * matters: a load/read error shows first, then the live save outcome, with
 * "Editing…" beating a stale "Saved" while the debounce window is still open.
 * @param props - The indicator's status, save status, and dirty flag
 * @returns The text to show and its Tailwind color classes
 */
function saveIndicatorLabel(props: SaveIndicatorProps): {
  text: string;
  className: string;
} {
  const { status, saveStatus, dirty } = props;
  const muted = "text-zinc-500";
  const red = "text-red-600 dark:text-red-400";

  if (status.kind === "loading") return { text: "Loading…", className: muted };
  if (status.kind === "error") return { text: status.message, className: red };
  if (saveStatus === "saving") return { text: "Saving…", className: muted };
  if (saveStatus === "error") return { text: "Save failed", className: red };
  if (dirty) return { text: "Editing…", className: muted };
  if (saveStatus === "saved")
    return { text: "Saved", className: "text-green-600 dark:text-green-400" };

  return { text: "Auto-save on", className: muted };
}
