// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type GenUiEvent,
  type LiveChange,
  type SyncStatus,
  type Widget,
} from "#src/shared/gen-ui-types";

export interface StreamState {
  /** Null until the first snapshot. */
  epoch: string | null;
  /** The version of the last event applied. */
  version: number;
  widgets: Widget[];
  /** How clip widgets are kept current. */
  sync: SyncStatus;
}

export interface StreamStep {
  state: StreamState;
  /** Versions jumped: the caller should reload the snapshot. */
  needsSnapshot: boolean;
  /** What to tell the clip widgets, if anything. */
  live: LiveChange | null;
}

export const EMPTY_STREAM: StreamState = {
  epoch: null,
  version: 0,
  widgets: [],
  sync: { mode: "writes-only", detail: "" },
};

/** Tells every clip widget to re-read. */
export const REFRESH_ALL: LiveChange = {
  tool: "resync",
  ids: [],
  paths: [],
  all: true,
};

/**
 * Apply one event to the viewer's state.
 *
 * A snapshot replaces everything. After the first one, any snapshot that isn't
 * the continuation of what the viewer had (a reconnect, a restart) also makes
 * every clip re-read, because "Live changed" events may have been missed. A
 * change whose version isn't the next one means the viewer missed events.
 *
 * @param state - What the viewer has
 * @param event - What arrived
 * @returns The new state and what to do about it
 */
export function applyGenUiEvent(
  state: StreamState,
  event: GenUiEvent,
): StreamStep {
  if (event.type === "snapshot") {
    const continued =
      state.epoch === event.epoch && state.version === event.version;

    return {
      state: {
        epoch: event.epoch,
        version: event.version,
        widgets: event.widgets,
        sync: event.sync,
      },
      needsSnapshot: false,
      live: state.epoch == null || continued ? null : REFRESH_ALL,
    };
  }

  if (state.epoch == null || event.version !== state.version + 1) {
    return { state, needsSnapshot: true, live: null };
  }

  const next = { ...state, version: event.version };

  if (event.type === "status") {
    return {
      state: { ...next, sync: event.sync },
      needsSnapshot: false,
      live: null,
    };
  }

  if (event.type === "live") {
    return { state: next, needsSnapshot: false, live: event };
  }

  const { change } = event;

  return {
    state: {
      ...next,
      widgets:
        change.op === "remove"
          ? state.widgets.filter((widget) => widget.id !== change.id)
          : upsert(state.widgets, change.widget),
    },
    needsSnapshot: false,
    live: null,
  };
}

/**
 * @param widgets - The current widgets
 * @param widget - One to add, or to replace the one with its id
 * @returns The new list, keeping order
 */
function upsert(widgets: Widget[], widget: Widget): Widget[] {
  const index = widgets.findIndex((existing) => existing.id === widget.id);

  if (index < 0) {
    return [...widgets, widget];
  }

  return widgets.map((existing, i) => (i === index ? widget : existing));
}
