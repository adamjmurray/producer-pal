// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { type GenUiEvent } from "#src/shared/gen-ui-types.ts";
import { resetHubForTesting, subscribe } from "../gen-ui-hub.ts";
import {
  createWidget,
  getSnapshot,
  listWidgets,
  removeWidget,
  resetWidgetStoreForTesting,
  updateWidget,
} from "../widget-store.ts";
import { useTempConfigDir } from "../../../tests/config-dir-test-helpers.ts";

const configDir = useTempConfigDir();

beforeEach(() => {
  resetHubForTesting();
  resetWidgetStoreForTesting();
});

/**
 * Forget memory, as a server restart would.
 */
function restart(): void {
  resetHubForTesting();
  resetWidgetStoreForTesting();
}

describe("widget store", () => {
  it("creates, lists, updates and removes widgets", () => {
    const clip = createWidget({ kind: "clip", ref: "t0/s3", title: "Bass" });
    const text = createWidget({ kind: "text", text: "Try a fill" });

    expect(clip).toStrictEqual({
      ok: true,
      widget: { id: "w1", kind: "clip", ref: "t0/s3", title: "Bass" },
    });
    expect(text.ok && text.widget.id).toBe("w2");
    expect(listWidgets()).toHaveLength(2);

    const updated = updateWidget("w1", { ref: "12", title: "" });

    expect(updated).toStrictEqual({
      ok: true,
      widget: { id: "w1", kind: "clip", ref: "12" },
    });

    expect(removeWidget("w2").ok).toBe(true);
    expect(listWidgets().map((w) => w.id)).toStrictEqual(["w1"]);
  });

  it.each([
    [{ kind: "chart" }, "kind must be one of"],
    [{ kind: "clip" }, "needs a ref"],
    [{ kind: "clip", ref: "t0" }, "needs a ref"],
    [{ kind: "clip", ref: "t0[5|1]" }, "needs a ref"],
    [{ kind: "text", text: "  " }, "needs text"],
    [{ kind: "text", text: "x".repeat(4001) }, "over 4000"],
    [{ kind: "text", text: "hi", title: 5 }, "title must be a string"],
  ])("refuses %j", (input, message) => {
    const result = createWidget(input);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
    expect(listWidgets()).toStrictEqual([]);
  });

  it("refuses changes that don't fit the widget, and leaves it as it was", () => {
    createWidget({ kind: "clip", ref: "12" });
    createWidget({ kind: "text", text: "hi" });

    const toKind = updateWidget("w1", { kind: "text" });
    const textOnClip = updateWidget("w1", { text: "no" });
    const refOnText = updateWidget("w2", { ref: "12" });
    const badRef = updateWidget("w1", { ref: "nope" });

    for (const result of [toKind, textOnClip, refOnText, badRef]) {
      expect(result.ok).toBe(false);
      expect(!result.ok && result.notFound).toBeUndefined();
    }

    expect(listWidgets()[0]).toStrictEqual({
      id: "w1",
      kind: "clip",
      ref: "12",
    });
  });

  it("answers not-found for an id nobody has", () => {
    const missing = {
      ok: false,
      error: 'No widget with id "w9"',
      notFound: true,
    };

    expect(updateWidget("w9", { title: "x" })).toStrictEqual(missing);
    expect(removeWidget("w9")).toStrictEqual(missing);
  });

  it("sends one numbered event per change, and none for a refusal", () => {
    const events: GenUiEvent[] = [];

    subscribe((event) => events.push(event));

    createWidget({ kind: "text", text: "a" });
    createWidget({ kind: "clip" });
    updateWidget("w1", { text: "b" });
    removeWidget("w1");

    expect(events.map((e) => [e.type, e.version])).toStrictEqual([
      ["widget", 1],
      ["widget", 2],
      ["widget", 3],
    ]);
    expect(events[2]).toStrictEqual({
      type: "widget",
      version: 3,
      change: { op: "remove", id: "w1" },
    });
  });

  it("snapshots the widgets with the epoch and version", () => {
    createWidget({ kind: "text", text: "a" });

    expect(getSnapshot()).toStrictEqual({
      version: 1,
      widgets: [{ id: "w1", kind: "text", text: "a" }],
      sync: expect.objectContaining({ mode: "writes-only" }),
      epoch: expect.any(String),
    });
  });
});

describe("widget store persistence", () => {
  it("keeps widgets, ids and versions across a restart", () => {
    createWidget({ kind: "clip", ref: "t1/s0" });
    createWidget({ kind: "text", text: "a" });
    removeWidget("w1");

    restart();

    expect(listWidgets()).toStrictEqual([
      { id: "w2", kind: "text", text: "a" },
    ]);
    // Numbering and versions continue, never reuse.
    expect(getSnapshot().version).toBe(3);
    expect(createWidget({ kind: "text", text: "b" })).toStrictEqual({
      ok: true,
      widget: { id: "w3", kind: "text", text: "b" },
    });
    expect(getSnapshot().version).toBe(4);
  });

  it("writes under the user-data dir", () => {
    createWidget({ kind: "text", text: "a" });

    const saved = JSON.parse(
      readFileSync(join(configDir(), "ui", "widgets.json"), "utf8"),
    ) as { version: number; widgets: unknown[] };

    expect(saved.version).toBe(1);
    expect(saved.widgets).toHaveLength(1);
  });

  it("skips entries it can't draw, and a corrupt file", () => {
    mkdirSync(join(configDir(), "ui"));
    writeFileSync(
      join(configDir(), "ui", "widgets.json"),
      JSON.stringify({
        version: 7,
        widgets: [
          { id: "w1", kind: "text", text: "ok" },
          { id: "w2", kind: "chart" },
          { id: "w3", kind: "clip", ref: "bad" },
          "junk",
        ],
      }),
    );

    expect(listWidgets().map((w) => w.id)).toStrictEqual(["w1"]);
    expect(getSnapshot().version).toBe(7);

    restart();
    writeFileSync(join(configDir(), "ui", "widgets.json"), "{not json");

    expect(listWidgets()).toStrictEqual([]);
  });

  it("starts empty when the saved file has no widget list", () => {
    mkdirSync(join(configDir(), "ui"));
    writeFileSync(join(configDir(), "ui", "widgets.json"), "{}");

    expect(listWidgets()).toStrictEqual([]);
  });

  it("keeps a change in memory and tells viewers when the save fails", () => {
    // A file where the folder should be makes every save fail.
    writeFileSync(join(configDir(), "ui"), "not a folder");

    const events: GenUiEvent[] = [];

    subscribe((event) => events.push(event));

    const result = createWidget({ kind: "text", text: "a" });

    expect(result.ok).toBe(true);
    expect(listWidgets()).toHaveLength(1);
    expect(events).toHaveLength(1);
  });
});

describe("widget store edge cases", () => {
  it("changes only the title of a text widget, and refuses a bad title", () => {
    createWidget({ kind: "text", text: "hi" });

    expect(updateWidget("w1", { title: "Note" })).toStrictEqual({
      ok: true,
      widget: { id: "w1", kind: "text", text: "hi", title: "Note" },
    });
    expect(updateWidget("w1", { title: 5 }).ok).toBe(false);
    expect(updateWidget("w1", { title: "x".repeat(121) }).ok).toBe(false);
  });

  it("ignores null entries in the saved file", () => {
    mkdirSync(join(configDir(), "ui"));
    writeFileSync(
      join(configDir(), "ui", "widgets.json"),
      JSON.stringify({
        widgets: [null, { id: "w4", kind: "text", text: "a" }],
      }),
    );

    expect(listWidgets().map((w) => w.id)).toStrictEqual(["w4"]);
  });
});

describe("widget store with ids it didn't number", () => {
  it("numbers new widgets after the highest w<number> and ignores other ids", () => {
    mkdirSync(join(configDir(), "ui"));
    writeFileSync(
      join(configDir(), "ui", "widgets.json"),
      JSON.stringify({
        version: 1,
        widgets: [
          { id: "custom", kind: "text", text: "a" },
          { id: "w6", kind: "text", text: "b" },
        ],
      }),
    );

    expect(createWidget({ kind: "text", text: "c" })).toStrictEqual({
      ok: true,
      widget: { id: "w7", kind: "text", text: "c" },
    });
  });

  it("refuses an update that leaves a text widget with no text", () => {
    createWidget({ kind: "text", text: "hi" });

    expect(updateWidget("w1", { text: "   " }).ok).toBe(false);
    expect(listWidgets()[0]).toStrictEqual({
      id: "w1",
      kind: "text",
      text: "hi",
    });
  });
});
