// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Widget } from "#src/shared/gen-ui-types";
import {
  useGenUiStream,
  type LiveTick,
} from "#webui/hooks/connection/use-gen-ui-stream";
import { ClipWidgetCard } from "./ClipWidgetCard";
import { TextWidgetCard } from "./TextWidgetCard";

/**
 * The widget side panel of the hidden generative-UI view
 * (`/chat?view=gen`). Experimental: nothing links here.
 *
 * @returns Panel element
 */
export function GenPanel(): preact.JSX.Element {
  const { widgets, status, live } = useGenUiStream();

  return (
    <aside className="flex h-screen w-96 shrink-0 flex-col border-l border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
      <header className="flex items-baseline justify-between border-b border-zinc-300 px-3 py-2 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Generative UI
        </h2>
        <span className="text-xs text-zinc-500" data-testid="gen-status">
          {status}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {status === "unavailable" ? (
          <p className="text-sm text-zinc-500">
            Not available in this build. Build with ENABLE_GEN_UI=true.
          </p>
        ) : widgets.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No widgets yet. Ask the AI to show something here.
          </p>
        ) : (
          widgets.map((widget) => (
            <WidgetCard
              key={`${widget.id}:${widget.kind === "clip" ? widget.ref : ""}`}
              widget={widget}
              live={live}
            />
          ))
        )}
      </div>
    </aside>
  );
}

/**
 * @param props - Component props
 * @param props.widget - The widget to draw
 * @param props.live - The latest "Live changed" tick
 * @returns The card for the widget's kind
 */
function WidgetCard({
  widget,
  live,
}: {
  widget: Widget;
  live: LiveTick | null;
}): preact.JSX.Element {
  return widget.kind === "clip" ? (
    <ClipWidgetCard widget={widget} live={live} />
  ) : (
    <TextWidgetCard widget={widget} />
  );
}
