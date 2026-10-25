// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type GenUiEvent, type Widget } from "#src/shared/gen-ui-types";
import {
  applyGenUiEvent,
  EMPTY_STREAM,
  REFRESH_ALL,
  type StreamState,
} from "#webui/lib/utils/gen-ui/apply-gen-ui-event";

const SYNC = { mode: "listening", detail: "watching" } as const;

const text = (id: string): Widget => ({ id, kind: "text", text: id });

const snapshot = (
  version: number,
  widgets: Widget[] = [],
  epoch = "e1",
): GenUiEvent => ({ type: "snapshot", epoch, version, widgets, sync: SYNC });

const connected: StreamState = {
  epoch: "e1",
  version: 3,
  widgets: [text("w1")],
  sync: SYNC,
};

describe("applyGenUiEvent", () => {
  it("takes the first snapshot without re-reading clips", () => {
    const step = applyGenUiEvent(EMPTY_STREAM, snapshot(5, [text("w1")]));

    expect(step).toStrictEqual({
      state: { epoch: "e1", version: 5, widgets: [text("w1")], sync: SYNC },
      needsSnapshot: false,
      live: null,
    });
  });

  it("adds, replaces and removes widgets in order", () => {
    const added = applyGenUiEvent(connected, {
      type: "widget",
      version: 4,
      change: { op: "upsert", widget: text("w2") },
    });
    const replaced = applyGenUiEvent(added.state, {
      type: "widget",
      version: 5,
      change: { op: "upsert", widget: { id: "w1", kind: "text", text: "new" } },
    });
    const removed = applyGenUiEvent(replaced.state, {
      type: "widget",
      version: 6,
      change: { op: "remove", id: "w2" },
    });

    expect(added.state.widgets.map((w) => w.id)).toStrictEqual(["w1", "w2"]);
    expect(replaced.state.widgets[0]).toStrictEqual({
      id: "w1",
      kind: "text",
      text: "new",
    });
    expect(removed.state).toStrictEqual({
      epoch: "e1",
      version: 6,
      widgets: [{ id: "w1", kind: "text", text: "new" }],
      sync: SYNC,
    });
  });

  it("takes a sync status change in order, and leaves the clips alone", () => {
    const sync = { mode: "writes-only", detail: "no script" } as const;
    const step = applyGenUiEvent(connected, {
      type: "status",
      version: 4,
      sync,
    });

    expect(step.state).toStrictEqual({ ...connected, version: 4, sync });
    expect(step.live).toBeNull();
    expect(step.needsSnapshot).toBe(false);
  });

  it("asks for a snapshot when a status change skips a version", () => {
    const step = applyGenUiEvent(connected, {
      type: "status",
      version: 6,
      sync: SYNC,
    });

    expect(step.needsSnapshot).toBe(true);
  });

  it("passes a Live change on for the clips to act on", () => {
    const change = {
      type: "live" as const,
      version: 4,
      tool: "ppal-create-clip",
      ids: ["12"],
      paths: [],
      all: false,
    };
    const step = applyGenUiEvent(connected, change);

    expect(step.live).toBe(change);
    expect(step.state.version).toBe(4);
    expect(step.needsSnapshot).toBe(false);
  });

  it("asks for a snapshot when versions jump, and changes nothing", () => {
    const step = applyGenUiEvent(connected, {
      type: "widget",
      version: 6,
      change: { op: "remove", id: "w1" },
    });

    expect(step).toStrictEqual({
      state: connected,
      needsSnapshot: true,
      live: null,
    });
  });

  it("asks for a snapshot for a change that repeats a version it has", () => {
    const step = applyGenUiEvent(connected, {
      type: "live",
      version: 3,
      tool: "x",
      ids: [],
      paths: [],
      all: true,
    });

    expect(step.needsSnapshot).toBe(true);
  });

  it("asks for a snapshot for a change that arrives before any snapshot", () => {
    const step = applyGenUiEvent(EMPTY_STREAM, {
      type: "widget",
      version: 1,
      change: { op: "remove", id: "w1" },
    });

    expect(step.needsSnapshot).toBe(true);
  });

  it("re-reads every clip when a snapshot isn't where the viewer left off", () => {
    // Reconnected after missing events.
    expect(applyGenUiEvent(connected, snapshot(5)).live).toBe(REFRESH_ALL);
    // The server restarted: same number, different server.
    expect(applyGenUiEvent(connected, snapshot(3, [], "e2")).live).toBe(
      REFRESH_ALL,
    );
  });

  it("leaves the clips alone when a snapshot continues from the same point", () => {
    expect(applyGenUiEvent(connected, snapshot(3)).live).toBeNull();
  });
});
