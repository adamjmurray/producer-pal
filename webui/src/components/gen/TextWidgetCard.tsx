// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type TextWidget } from "#src/shared/gen-ui-types";

/**
 * A plain note from the AI.
 * @param props - Component props
 * @param props.widget - The text widget
 * @returns Card element
 */
export function TextWidgetCard({
  widget,
}: {
  widget: TextWidget;
}): preact.JSX.Element {
  return (
    <section className="rounded-lg border border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
      {widget.title != null && (
        <h3 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {widget.title}
        </h3>
      )}
      <p className="text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
        {widget.text}
      </p>
    </section>
  );
}
