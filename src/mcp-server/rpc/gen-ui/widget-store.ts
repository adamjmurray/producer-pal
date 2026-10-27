// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The widgets the AI has put on the generative-UI view, held in memory. Each
// change is handed to a sink that keeps it in the Live Set (see set-storage.ts),
// and the Set's saved list is loaded back with loadWidgetsFromSet. With no sink
// (tests, or the remote script missing) the list lives for the session only.

import { errorMessage } from "#src/shared/error-message.ts";
import {
  type SyncStatus,
  type Widget,
  type WidgetChange,
} from "#src/shared/gen-ui-types.ts";
import * as console from "../../node-for-max-logger.ts";
import { currentVersion, EPOCH, getSync, publish } from "./gen-ui-hub.ts";
import { buildWidget, patchWidget, type WidgetFields } from "./widget-input.ts";
import { decodeWidgets, encodeWidgets } from "./widget-blob.ts";

export type StoreResult =
  | { ok: true; widget: Widget }
  | { ok: false; error: string; notFound?: boolean };

type Fingerprint = { name: string; length: number };

const TOO_MANY =
  "The Live Set can't hold more widgets; remove one first (the list is saved inside the Set)";

let widgets: Widget[] = [];
let nextNumber = 1;
let sink: ((text: string) => void) | undefined;

/**
 * @param save - Called with the text to keep in the Set after every change
 */
export function setWidgetSink(
  save: ((text: string) => void) | undefined,
): void {
  sink = save;
}

/**
 * @returns Every widget, oldest first
 */
export function listWidgets(): Widget[] {
  return [...widgets];
}

/**
 * @returns What a viewer needs to start: the widgets and the version they are at
 */
export function getSnapshot(): {
  epoch: string;
  version: number;
  widgets: Widget[];
  sync: SyncStatus;
} {
  return {
    epoch: EPOCH,
    version: currentVersion(),
    widgets: listWidgets(),
    sync: getSync(),
  };
}

/**
 * Add a widget.
 * @param input - `kind`, `title`, and `ref` or `text`
 * @returns The new widget, or what is wrong with the input
 */
export function createWidget(input: WidgetFields): StoreResult {
  const built = buildWidget(input, `w${nextNumber}`);

  if (!built.ok) {
    return built;
  }

  if (!fits([...widgets, built.value])) {
    return { ok: false, error: TOO_MANY };
  }

  nextNumber += 1;
  widgets.push(built.value);
  commit({ op: "upsert", widget: built.value });

  return { ok: true, widget: built.value };
}

/**
 * Change a widget.
 * @param id - The widget to change
 * @param patch - The fields to change
 * @returns The changed widget, or why not
 */
export function updateWidget(id: string, patch: WidgetFields): StoreResult {
  const index = widgets.findIndex((widget) => widget.id === id);
  const current = widgets[index];

  if (current == null) {
    return notFound(id);
  }

  const next = patchWidget(current, patch);

  if (!next.ok) {
    return next;
  }

  if (!fits(widgets.map((w, i) => (i === index ? next.value : w)))) {
    return { ok: false, error: TOO_MANY };
  }

  widgets[index] = next.value;
  commit({ op: "upsert", widget: next.value });

  return { ok: true, widget: next.value };
}

/**
 * Record what the remote script learned about a clip widget: where the clip is
 * now, what it looks like, or that it is gone. Not for callers' input.
 * @param id - The widget
 * @param state - The fields to set; `gone: false` clears it
 * @param state.ref - The clip's current path
 * @param state.fingerprint - The clip's name and length
 * @param state.gone - True once the clip is deleted or replaced
 * @returns The changed widget, or why not
 */
export function updateClipState(
  id: string,
  state: {
    ref?: string;
    fingerprint?: Fingerprint;
    gone?: boolean;
  },
): StoreResult {
  const index = widgets.findIndex((widget) => widget.id === id);
  const current = widgets[index];

  if (current?.kind !== "clip") {
    return notFound(id);
  }

  const { gone: _gone, ...rest } = current;
  const next = {
    ...rest,
    ...(state.ref == null ? {} : { ref: state.ref }),
    ...(state.fingerprint == null ? {} : { fingerprint: state.fingerprint }),
    ...((state.gone ?? current.gone === true) ? { gone: true as const } : {}),
  };

  // Nothing new: don't spend a version on it.
  if (JSON.stringify(next) === JSON.stringify(current)) {
    return { ok: true, widget: current };
  }

  widgets[index] = next;
  commit({ op: "upsert", widget: next });

  return { ok: true, widget: next };
}

/**
 * Take a widget off the view.
 * @param id - The widget to remove
 * @returns The removed widget, or why not
 */
export function removeWidget(id: string): StoreResult {
  const index = widgets.findIndex((widget) => widget.id === id);
  const [removed] = index < 0 ? [] : widgets.splice(index, 1);

  if (removed == null) {
    return notFound(id);
  }

  commit({ op: "remove", id });

  return { ok: true, widget: removed };
}

/**
 * Show the Set's saved list. Called once, when the list first arrives. Widgets
 * already on the view (made before it arrived) are kept after the Set's, with
 * new ids, so neither side is lost. Viewers hear it as ordinary changes. Nothing
 * is saved from here: the caller decides what needs saving. Text that isn't a
 * widget list is ignored.
 * @param text - What the Set held
 */
export function loadWidgetsFromSet(text: string): void {
  const loaded = decodeWidgets(text);

  if (loaded == null) {
    console.warn("Ignoring a saved UI widget list that can't be read");

    return;
  }

  if (loaded.length === 0) {
    return;
  }

  const early = widgets;

  for (const { id } of early) {
    publish({ type: "widget", change: { op: "remove", id } });
  }

  nextNumber =
    Math.max(0, ...loaded.map((w) => Number(w.id.replace(/^w/, "")) || 0)) + 1;

  widgets = [...loaded, ...early.map(renumber)];

  for (const widget of widgets) {
    publish({ type: "widget", change: { op: "upsert", widget } });
  }
}

/**
 * @param widget - A widget made before the Set's list arrived
 * @returns The same widget under the next free id
 */
function renumber(widget: Widget): Widget {
  const renumbered = { ...widget, id: `w${nextNumber}` };

  nextNumber += 1;

  return renumbered;
}

/** Empty the list and drop the sink. For tests. */
export function resetWidgetStoreForTesting(): void {
  widgets = [];
  nextNumber = 1;
  sink = undefined;
}

/**
 * @param id - The id nobody has
 * @returns A not-found result
 */
function notFound(id: string): StoreResult {
  return { ok: false, error: `No widget with id "${id}"`, notFound: true };
}

/**
 * @param list - A list of widgets
 * @returns True when the Set can hold it
 */
function fits(list: Widget[]): boolean {
  return encodeWidgets(list) != null;
}

/**
 * Tell the viewers, and hand the new list to the sink to keep in the Set. A sink
 * that throws is logged and does not undo the change.
 * @param change - What changed
 */
function commit(change: WidgetChange): void {
  publish({ type: "widget", change });

  try {
    const text = encodeWidgets(widgets);

    if (text == null) {
      console.warn("The UI widget list is too big to save in the Live Set");
    } else {
      sink?.(text);
    }
  } catch (error) {
    console.warn(`Could not save the UI widgets: ${errorMessage(error)}`);
  }
}

/** Beats two lengths may differ by and still match. Same as the script's. */
const LENGTH_TOLERANCE = 1e-4;

/**
 * @param stored - The fingerprint a widget holds, if any
 * @param reported - What the remote script says the clip is now
 * @returns The new fingerprint when the clip's name or length has changed
 */
export function changedFingerprint(
  stored: Fingerprint | undefined,
  reported: unknown,
): Fingerprint | undefined {
  const differs =
    isFingerprint(reported) &&
    (stored?.name !== reported.name ||
      Math.abs(stored.length - reported.length) > LENGTH_TOLERANCE);

  return differs ? reported : undefined;
}

/**
 * @param value - Anything a reply field may hold
 * @returns True for `{name, length}`
 */
export function isFingerprint(value: unknown): value is Fingerprint {
  const candidate = value as { name?: unknown; length?: unknown } | null;

  return (
    typeof candidate?.name === "string" && typeof candidate.length === "number"
  );
}
