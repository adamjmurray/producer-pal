// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The widget list as the text the remote script keeps in the Live Set.

import { type Widget } from "#src/shared/gen-ui-types.ts";
import { buildWidget, type WidgetFields } from "./widget-input.ts";

/**
 * The most the Set holds, in characters. The same cap as the remote script's
 * (ui_widgets.py), so a list that passes here is never refused there. A list too
 * big for this is refused rather than saved cut short.
 */
export const MAX_BLOB_CHARS = 24_000;

/**
 * @param widgets - The widgets to keep
 * @returns The text to save, or null when it would be too big
 */
export function encodeWidgets(widgets: Widget[]): string | null {
  const text = JSON.stringify({ v: 1, widgets });

  return text.length <= MAX_BLOB_CHARS ? text : null;
}

/**
 * @param text - What the Set held
 * @returns The widgets it held, [] for nothing saved, or null when the text
 *   isn't a widget list. Entries a current build can't draw are left out.
 */
export function decodeWidgets(text: string): Widget[] | null {
  if (text.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(text) as { widgets?: unknown } | null;

    return Array.isArray(parsed?.widgets)
      ? parsed.widgets.filter(isStoredWidget)
      : null;
  } catch {
    return null;
  }
}

/**
 * Keep only entries a current build can draw, so one bad entry can't break the
 * view.
 * @param value - One entry from the saved list
 * @returns True for a well-formed widget
 */
function isStoredWidget(value: unknown): value is Widget {
  const { id } = (value ?? {}) as Record<string, unknown>;

  return typeof id === "string" && buildWidget(value as WidgetFields, id).ok;
}
