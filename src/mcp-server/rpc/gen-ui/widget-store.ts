// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The widgets the AI has put on the generative-UI view. Held in memory and
// saved to ~/.producer-pal/ui/widgets.json after every change, so a page reload
// or a server restart keeps them. Node-side only: the file is never read by V8.

import { readFileSync } from "node:fs";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  type SyncStatus,
  type Widget,
  type WidgetChange,
} from "#src/shared/gen-ui-types.ts";
import * as console from "../../node-for-max-logger.ts";
import {
  isConfigDirInert,
  resolveConfigPath,
  writeConfigFileAtomic,
} from "../../helpers/config-store/config-markdown-store.ts";
import {
  currentVersion,
  EPOCH,
  getSync,
  publish,
  restoreVersion,
} from "./gen-ui-hub.ts";
import { buildWidget, patchWidget, type WidgetFields } from "./widget-input.ts";

const FILENAME = "ui/widgets.json";

export type StoreResult =
  | { ok: true; widget: Widget }
  | { ok: false; error: string; notFound?: boolean };

let widgets: Widget[] | undefined;
let nextNumber = 1;

/**
 * @returns Every widget, oldest first
 */
export function listWidgets(): Widget[] {
  return [...load()];
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
  const list = load();
  const built = buildWidget(input, `w${nextNumber}`);

  if (!built.ok) {
    return built;
  }

  nextNumber += 1;
  list.push(built.value);
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
  const list = load();
  const index = list.findIndex((widget) => widget.id === id);
  const current = list[index];

  if (current == null) {
    return notFound(id);
  }

  const next = patchWidget(current, patch);

  if (!next.ok) {
    return next;
  }

  list[index] = next.value;
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
    fingerprint?: { name: string; length: number };
    gone?: boolean;
  },
): StoreResult {
  const list = load();
  const index = list.findIndex((widget) => widget.id === id);
  const current = list[index];

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

  list[index] = next;
  commit({ op: "upsert", widget: next });

  return { ok: true, widget: next };
}

/**
 * Take a widget off the view.
 * @param id - The widget to remove
 * @returns The removed widget, or why not
 */
export function removeWidget(id: string): StoreResult {
  const list = load();
  const index = list.findIndex((widget) => widget.id === id);
  const [removed] = index < 0 ? [] : list.splice(index, 1);

  if (removed == null) {
    return notFound(id);
  }

  commit({ op: "remove", id });

  return { ok: true, widget: removed };
}

/** Forget what is in memory, so the next call reads the file again. For tests. */
export function resetWidgetStoreForTesting(): void {
  widgets = undefined;
  nextNumber = 1;
}

/**
 * @param id - The id nobody has
 * @returns A not-found result
 */
function notFound(id: string): StoreResult {
  return { ok: false, error: `No widget with id "${id}"`, notFound: true };
}

/**
 * Save, then tell the viewers. A failed save is logged and does not undo the
 * change: the view still shows it, and the next change tries the file again.
 * @param change - What changed
 */
function commit(change: WidgetChange): void {
  const event = publish({ type: "widget", change });

  save(event.version);
}

/**
 * @returns The widget list, read from the file the first time
 */
function load(): Widget[] {
  if (widgets != null) {
    return widgets;
  }

  const stored = readStored();

  widgets = stored.widgets;
  restoreVersion(stored.version);
  nextNumber =
    Math.max(
      0,
      ...widgets.map((widget) => Number(widget.id.replace(/^w/, "")) || 0),
    ) + 1;

  return widgets;
}

/**
 * @returns The saved widgets and version; empty when the file is missing or unusable
 */
function readStored(): { version: number; widgets: Widget[] } {
  const empty = { version: 0, widgets: [] };

  if (isConfigDirInert()) {
    return empty;
  }

  const target = resolveConfigPath(FILENAME);
  let text: string;

  try {
    text = readFileSync(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to read ${target}: ${errorMessage(error)}`);
    }

    return empty;
  }

  try {
    const parsed = JSON.parse(text) as {
      version?: unknown;
      widgets?: unknown;
    };
    const list = Array.isArray(parsed.widgets) ? parsed.widgets : [];

    return {
      version: typeof parsed.version === "number" ? parsed.version : 0,
      widgets: list.filter(isStoredWidget),
    };
  } catch (error) {
    console.warn(`Ignoring malformed ${target}: ${errorMessage(error)}`);

    return empty;
  }
}

/**
 * Keep only entries a current build can draw, so one bad entry in the file
 * can't break the view.
 * @param value - One entry from the file
 * @returns True for a well-formed widget
 */
function isStoredWidget(value: unknown): value is Widget {
  const { id, kind } = (value ?? {}) as Record<string, unknown>;

  return (
    typeof id === "string" &&
    buildWidget(value as WidgetFields, id).ok &&
    (kind === "clip" || kind === "text")
  );
}

/**
 * @param version - The version to store with the widgets
 */
function save(version: number): void {
  if (isConfigDirInert()) {
    return;
  }

  try {
    writeConfigFileAtomic(
      resolveConfigPath(FILENAME),
      `${JSON.stringify({ version, widgets }, null, 2)}\n`,
    );
  } catch (error) {
    console.warn(`Could not save the UI widgets: ${errorMessage(error)}`);
  }
}
