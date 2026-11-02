// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from "preact/hooks";
import { type GenUiEvent, type LiveChange } from "#src/shared/gen-ui-types";
import {
  applyGenUiEvent,
  EMPTY_STREAM,
  type StreamState,
} from "#webui/lib/utils/gen-ui/apply-gen-ui-event";
import { getUiEventsUrl, getUiWidgetsUrl } from "#webui/utils/mcp-url";

export type StreamStatus = "connecting" | "live" | "unavailable";

export interface LiveTick {
  /** Rises with every event, so an effect can depend on it. */
  seq: number;
  change: LiveChange;
}

export interface GenUiStream {
  widgets: StreamState["widgets"];
  sync: StreamState["sync"];
  status: StreamStatus;
  live: LiveTick | null;
}

type SourceFactory = (url: string) => EventSource;

// Defined once: a new function each render would restart the effect.
const openEventSource: SourceFactory = (url) => new EventSource(url);

/**
 * Follow the generative-UI stream: the widgets, and "Live changed" ticks for
 * the clip widgets to re-read on.
 *
 * Checks the widgets endpoint first. A build without the feature answers 404,
 * and an EventSource would retry that forever.
 *
 * @param createSource - Opens the event stream; replaceable for tests
 * @returns The widgets, the connection status, and the latest tick
 */
export function useGenUiStream(
  createSource: SourceFactory = openEventSource,
): GenUiStream {
  const [state, setState] = useState<StreamState>(EMPTY_STREAM);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [live, setLive] = useState<LiveTick | null>(null);
  const stateRef = useRef<StreamState>(EMPTY_STREAM);

  useEffect(() => {
    let source: EventSource | undefined;
    const lifetime = new AbortController();
    let reloading = false;

    const handle = (event: GenUiEvent): void => {
      const step = applyGenUiEvent(stateRef.current, event);

      stateRef.current = step.state;
      setState(step.state);

      if (step.live != null) {
        const change = step.live;

        setLive((prev) => ({ seq: (prev?.seq ?? 0) + 1, change }));
      }

      if (step.needsSnapshot) {
        void reload();
      }
    };

    // Versions jumped: events were missed, so ask for the whole picture.
    const reload = async (): Promise<void> => {
      if (reloading) {
        return;
      }

      reloading = true;

      try {
        const snapshot = await fetchSnapshot();

        if (snapshot != null && !lifetime.signal.aborted) {
          handle(snapshot);
        }
      } finally {
        reloading = false;
      }
    };

    void (async () => {
      const first = await fetchSnapshot();

      if (lifetime.signal.aborted) {
        return;
      }

      if (first == null) {
        setStatus("unavailable");

        return;
      }

      handle(first);
      source = createSource(getUiEventsUrl());
      source.onopen = () => setStatus("live");
      source.onerror = () => setStatus("connecting");

      source.onmessage = (message: MessageEvent<string>) => {
        try {
          handle(JSON.parse(message.data) as GenUiEvent);
        } catch {
          // A garbled event: the next version jump will trigger a reload.
        }
      };
    })();

    return () => {
      lifetime.abort();
      source?.close();
    };
  }, [createSource]);

  return { widgets: state.widgets, sync: state.sync, status, live };
}

/**
 * @returns The current snapshot as an event, or null when the server can't
 *   give one (no such endpoint, or unreachable)
 */
async function fetchSnapshot(): Promise<GenUiEvent | null> {
  try {
    const response = await fetch(getUiWidgetsUrl(), { cache: "no-store" });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as Omit<
      Extract<GenUiEvent, { type: "snapshot" }>,
      "type"
    >;

    return { type: "snapshot", ...body };
  } catch {
    return null;
  }
}
