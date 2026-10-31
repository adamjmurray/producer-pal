// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Checks what a caller sends for a widget (REST body or ppal-ui args) and turns
// it into the stored shape. Returns the error text; the caller picks the status.

import {
  WIDGET_KINDS,
  type Widget,
  type WidgetKind,
} from "#src/shared/gen-ui-types.ts";

const MAX_TITLE = 120;
const MAX_TEXT = 4000;
const CLIP_ID = /^\d+$/;
const SESSION_PATH = /^t\d+\/s\d+$/;

export type WidgetFields = Record<string, unknown>;

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Build a new widget from a request.
 * @param input - The caller's fields: `kind`, `title`, and `ref` or `text`
 * @param id - The id the store picked
 * @returns The widget, or what is wrong with the input
 */
export function buildWidget(input: WidgetFields, id: string): Checked<Widget> {
  const kind = input.kind;

  if (!isKind(kind)) {
    return fail(`kind must be one of: ${WIDGET_KINDS.join(", ")}`);
  }

  const title = readTitle(input);

  if (!title.ok) {
    return title;
  }

  const base = title.value == null ? { id } : { id, title: title.value };

  if (kind === "clip") {
    const ref = readRef(input.ref);

    return ref.ok ? ok({ ...base, kind, ref: ref.value }) : ref;
  }

  const text = readText(input.text);

  return text.ok ? ok({ ...base, kind, text: text.value }) : text;
}

/**
 * Apply a change to a stored widget. A widget keeps its kind; send a new one
 * instead.
 * @param widget - The stored widget
 * @param patch - The caller's fields to change
 * @returns The changed widget, or what is wrong with the input
 */
export function patchWidget(
  widget: Widget,
  patch: WidgetFields,
): Checked<Widget> {
  if (patch.kind != null && patch.kind !== widget.kind) {
    return fail(
      `A ${widget.kind} widget can't change kind; remove it and create a new one`,
    );
  }

  const title = readTitle(patch);

  if (!title.ok) {
    return title;
  }

  const next = { ...widget };

  if (patch.title !== undefined) {
    setOrClearTitle(next, title.value);
  }

  if (widget.kind === "clip") {
    return patchClip(next as typeof widget, patch);
  }

  if (patch.ref != null) {
    return fail("A text widget has no ref");
  }

  return patchText(next as typeof widget, patch);
}

/**
 * @param value - Anything
 * @returns True for a widget kind this build knows
 */
function isKind(value: unknown): value is WidgetKind {
  return (WIDGET_KINDS as readonly unknown[]).includes(value);
}

/**
 * @param widget - The widget to change in place
 * @param title - The new title, or null to clear it
 */
function setOrClearTitle(widget: Widget, title: string | null): void {
  if (title == null) {
    delete widget.title;
  } else {
    widget.title = title;
  }
}

/**
 * @param widget - A copy of the stored clip widget
 * @param patch - The caller's fields
 * @returns The changed widget, or an error
 */
function patchClip(
  widget: Extract<Widget, { kind: "clip" }>,
  patch: WidgetFields,
): Checked<Widget> {
  if (patch.text != null) {
    return fail("A clip widget has no text");
  }

  if (patch.ref === undefined) {
    return ok(widget);
  }

  const ref = readRef(patch.ref);

  if (!ref.ok) {
    return ref;
  }

  // A new ref is a different clip: what was known about the old one is void.
  const { fingerprint: _fingerprint, gone: _gone, ...rest } = widget;

  return ok(ref.value === widget.ref ? widget : { ...rest, ref: ref.value });
}

/**
 * @param widget - A copy of the stored text widget
 * @param patch - The caller's fields
 * @returns The changed widget, or an error
 */
function patchText(
  widget: Extract<Widget, { kind: "text" }>,
  patch: WidgetFields,
): Checked<Widget> {
  if (patch.text === undefined) {
    return ok(widget);
  }

  const text = readText(patch.text);

  return text.ok ? ok({ ...widget, text: text.value }) : text;
}

/**
 * @param fields - The caller's fields
 * @returns The title, null when it is blank (clears it), or an error. A missing
 *   title reads as null too; callers check `fields.title !== undefined` first.
 */
function readTitle(fields: WidgetFields): Checked<string | null> {
  const title = fields.title;

  if (title == null) {
    return ok(null);
  }

  if (typeof title !== "string") {
    return fail("title must be a string");
  }

  const trimmed = title.trim();

  if (trimmed.length > MAX_TITLE) {
    return fail(`title is over ${MAX_TITLE} characters`);
  }

  return ok(trimmed === "" ? null : trimmed);
}

/**
 * @param value - The caller's `ref`
 * @returns A Session clip id or path, or an error
 */
function readRef(value: unknown): Checked<string> {
  const ref = typeof value === "string" ? value.trim() : "";

  if (CLIP_ID.test(ref) || SESSION_PATH.test(ref)) {
    return ok(ref);
  }

  return fail(
    'A clip widget needs a ref: a clip id like "12" or a Session clip path like "t0/s3"',
  );
}

/**
 * @param value - The caller's `text`
 * @returns The text, or an error
 */
function readText(value: unknown): Checked<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return fail("A text widget needs text");
  }

  if (value.length > MAX_TEXT) {
    return fail(`text is over ${MAX_TEXT} characters`);
  }

  return ok(value);
}

/**
 * @param value - The good value
 * @returns A passing check
 */
function ok<T>(value: T): Checked<T> {
  return { ok: true, value };
}

/**
 * @param error - What is wrong
 * @returns A failing check
 */
function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
