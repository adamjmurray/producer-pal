// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { type GenUiEvent } from "#src/shared/gen-ui-types.ts";
import { resetHubForTesting, subscribe } from "../gen-ui-hub.ts";
import { decodeWidgets, encodeWidgets } from "../widget-blob.ts";
import {
  createWidget,
  getSnapshot,
  listWidgets,
  loadWidgetsFromSet,
  removeWidget,
  resetWidgetStoreForTesting,
  setWidgetSink,
  updateClipState,
  updateWidget,
} from "../widget-store.ts";

beforeEach(() => {
  resetHubForTesting();
  resetWidgetStoreForTesting();
});

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

describe("widget store in the Live Set", () => {
  let saved: string[];

  beforeEach(() => {
    saved = [];
    setWidgetSink((text) => saved.push(text));
  });

  it("hands the Set the whole list after every change", () => {
    createWidget({ kind: "text", text: "a" });
    createWidget({ kind: "clip", ref: "t0/s0" });
    removeWidget("w1");

    expect(saved.map((text) => decodeWidgets(text))).toStrictEqual([
      [{ id: "w1", kind: "text", text: "a" }],
      [
        { id: "w1", kind: "text", text: "a" },
        { id: "w2", kind: "clip", ref: "t0/s0" },
      ],
      [{ id: "w2", kind: "clip", ref: "t0/s0" }],
    ]);
  });

  it("saves nothing for a refused change", () => {
    createWidget({ kind: "clip", ref: "nope" });
    updateWidget("w9", { title: "x" });

    expect(saved).toStrictEqual([]);
  });

  it("works for the session with nothing to save into, like an unsaved Set", () => {
    setWidgetSink(undefined);

    expect(createWidget({ kind: "text", text: "a" }).ok).toBe(true);
    expect(listWidgets()).toHaveLength(1);
  });

  it("keeps the change and tells viewers when saving fails", () => {
    setWidgetSink(() => {
      throw new Error("no device");
    });

    const events: GenUiEvent[] = [];

    subscribe((event) => events.push(event));

    expect(createWidget({ kind: "text", text: "a" }).ok).toBe(true);
    expect(listWidgets()).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it("refuses a widget the Set can't hold, and leaves the list as it was", () => {
    createWidget({ kind: "text", text: "a" });

    let refused = createWidget({ kind: "text", text: "x".repeat(4000) });

    // Fill the Set with big notes until one doesn't fit.
    for (let i = 0; i < 10 && refused.ok; i++) {
      refused = createWidget({ kind: "text", text: `${i}`.repeat(4000) });
    }

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error).toContain("can't hold more widgets");

    const count = listWidgets().length;
    const grown = updateWidget("w1", { text: "y".repeat(4000) });

    expect(grown.ok).toBe(false);
    expect(listWidgets()).toHaveLength(count);
    expect(listWidgets()[0]).toStrictEqual({
      id: "w1",
      kind: "text",
      text: "a",
    });
  });
});

describe("loading the Set's widgets", () => {
  const listA = encodeWidgets([
    { id: "w1", kind: "clip", ref: "t0/s0" },
    { id: "w4", kind: "text", text: "A's note" },
  ]) as string;
  const listB = encodeWidgets([
    { id: "w2", kind: "text", text: "B's note" },
  ]) as string;

  it("shows the Set's widgets, and carries on numbering after them", () => {
    loadWidgetsFromSet(listA);

    expect(listWidgets().map((w) => w.id)).toStrictEqual(["w1", "w4"]);
    expect(createWidget({ kind: "text", text: "new" })).toStrictEqual({
      ok: true,
      widget: { id: "w5", kind: "text", text: "new" },
    });
  });

  it("swaps one Set's widgets for another's, telling viewers as ordinary changes", () => {
    loadWidgetsFromSet(listA);

    const events: GenUiEvent[] = [];

    subscribe((event) => events.push(event));
    loadWidgetsFromSet(listB);

    expect(listWidgets()).toStrictEqual([
      { id: "w2", kind: "text", text: "B's note" },
    ]);
    expect(
      events.map((e) => (e.type === "widget" ? e.change.op : e.type)),
    ).toStrictEqual(["remove", "remove", "upsert"]);
  });

  it("shows no widgets for a Set that has none", () => {
    loadWidgetsFromSet(listA);
    loadWidgetsFromSet("");

    expect(listWidgets()).toStrictEqual([]);
  });

  it("does not save back what it just loaded", () => {
    const saved: string[] = [];

    setWidgetSink((text) => saved.push(text));
    loadWidgetsFromSet(listA);

    expect(saved).toStrictEqual([]);

    createWidget({ kind: "text", text: "a" });

    expect(saved).toHaveLength(1);
  });

  it("says nothing when the Set holds what is already shown", () => {
    loadWidgetsFromSet(listA);

    const events: GenUiEvent[] = [];

    subscribe((event) => events.push(event));
    loadWidgetsFromSet(listA);

    expect(events).toStrictEqual([]);
  });

  it("ignores text that isn't a widget list, and keeps what it has", () => {
    loadWidgetsFromSet(listA);
    loadWidgetsFromSet("not base64 json!");

    expect(listWidgets()).toHaveLength(2);
  });

  it("leaves out saved entries it can't draw", () => {
    const mixed = Buffer.from(
      JSON.stringify({
        v: 1,
        widgets: [
          { id: "w1", kind: "text", text: "ok" },
          { id: "w2", kind: "chart" },
          { id: "w3", kind: "clip", ref: "bad" },
          null,
        ],
      }),
    ).toString("base64");

    loadWidgetsFromSet(mixed);

    expect(listWidgets().map((w) => w.id)).toStrictEqual(["w1"]);
  });

  it("restores a clip widget's moved path and gone verdict", () => {
    createWidget({ kind: "clip", ref: "t0/s0" });
    updateClipState("w1", { ref: "t2/s2", gone: true });

    const saved: string[] = [];

    setWidgetSink((text) => saved.push(text));
    updateClipState("w1", { fingerprint: { name: "Bass", length: 8 } });
    resetWidgetStoreForTesting();
    loadWidgetsFromSet(saved[0] ?? "");

    expect(listWidgets()).toStrictEqual([
      {
        id: "w1",
        kind: "clip",
        ref: "t2/s2",
        fingerprint: { name: "Bass", length: 8 },
        gone: true,
      },
    ]);
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
});

describe("widget store with ids it didn't number", () => {
  it("numbers new widgets after the highest w<number> and ignores other ids", () => {
    loadWidgetsFromSet(
      encodeWidgets([
        { id: "custom", kind: "text", text: "a" },
        { id: "w6", kind: "text", text: "b" },
      ]) as string,
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

describe("clip state kept by the server", () => {
  const fingerprint = { name: "Bass", length: 8 };

  it("records where the clip went, what it looks like, and that it is gone", () => {
    createWidget({ kind: "clip", ref: "t0/s0" });

    expect(updateClipState("w1", { fingerprint })).toStrictEqual({
      ok: true,
      widget: { id: "w1", kind: "clip", ref: "t0/s0", fingerprint },
    });
    expect(updateClipState("w1", { ref: "t1/s0" })).toStrictEqual({
      ok: true,
      widget: { id: "w1", kind: "clip", ref: "t1/s0", fingerprint },
    });
    expect(updateClipState("w1", { gone: true })).toStrictEqual({
      ok: true,
      widget: { id: "w1", kind: "clip", ref: "t1/s0", fingerprint, gone: true },
    });
    expect(updateClipState("w1", { gone: false })).toStrictEqual({
      ok: true,
      widget: { id: "w1", kind: "clip", ref: "t1/s0", fingerprint },
    });
  });

  it("spends no version when nothing changed", () => {
    createWidget({ kind: "clip", ref: "t0/s0" });
    updateClipState("w1", { fingerprint });

    const version = getSnapshot().version;

    updateClipState("w1", { fingerprint });
    updateClipState("w1", { gone: false });

    expect(getSnapshot().version).toBe(version);
  });

  it("tells viewers about a change as an ordinary widget update", () => {
    createWidget({ kind: "clip", ref: "t0/s0" });

    const events: GenUiEvent[] = [];

    subscribe((event) => events.push(event));
    updateClipState("w1", { gone: true });

    expect(events).toStrictEqual([
      {
        type: "widget",
        version: 2,
        change: {
          op: "upsert",
          widget: { id: "w1", kind: "clip", ref: "t0/s0", gone: true },
        },
      },
    ]);
  });

  it("refuses a widget that isn't a clip, or isn't there", () => {
    createWidget({ kind: "text", text: "hi" });

    expect(updateClipState("w1", { gone: true }).ok).toBe(false);
    expect(updateClipState("w9", { gone: true }).ok).toBe(false);
  });

  it("forgets what it knew about a clip when the AI points the widget elsewhere", () => {
    createWidget({ kind: "clip", ref: "t0/s0" });
    updateClipState("w1", { fingerprint, gone: true });

    expect(updateWidget("w1", { ref: "t3/s3" })).toStrictEqual({
      ok: true,
      widget: { id: "w1", kind: "clip", ref: "t3/s3" },
    });
  });

  it("keeps what it knew when only the title changes", () => {
    createWidget({ kind: "clip", ref: "t0/s0" });
    updateClipState("w1", { fingerprint, gone: true });

    expect(updateWidget("w1", { title: "Bass", ref: "t0/s0" })).toStrictEqual({
      ok: true,
      widget: {
        id: "w1",
        kind: "clip",
        ref: "t0/s0",
        fingerprint,
        gone: true,
        title: "Bass",
      },
    });
  });
});

describe("a list that grows past what the Set holds", () => {
  it("keeps the change in memory, warns, and saves nothing", () => {
    const saved: string[] = [];

    createWidget({ kind: "clip", ref: "t0/s0" });

    for (let i = 0; i < 4; i++) {
      expect(createWidget({ kind: "text", text: `${i}`.repeat(4000) }).ok).toBe(
        true,
      );
    }

    setWidgetSink((text) => saved.push(text));

    // The server's own note on a clip isn't checked against the limit.
    const grown = updateClipState("w1", {
      fingerprint: { name: "x".repeat(5000), length: 8 },
    });

    expect(grown.ok).toBe(true);
    expect(listWidgets()[0]).toHaveProperty("fingerprint");
    expect(saved).toStrictEqual([]);
  });
});
