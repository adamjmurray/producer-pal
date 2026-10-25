// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type GenUiEvent, type Widget } from "#src/shared/gen-ui-types.ts";
import { resetHubForTesting } from "../gen-ui-hub.ts";
import { resetWidgetStoreForTesting } from "../widget-store.ts";
import { registerGenUiRoutes } from "../gen-ui-routes.ts";
import {
  errorOf,
  postJson,
  putJson,
  startMarkdownRouteServer,
  useTempConfigDir,
  type MarkdownRouteServer,
} from "../../../tests/config-dir-test-helpers.ts";
import { openEventStream } from "./event-stream-test-helpers.ts";

useTempConfigDir();

let server: MarkdownRouteServer;
let widgets = "";
let events = "";

beforeAll(async () => {
  server = await startMarkdownRouteServer(registerGenUiRoutes);
  widgets = `${server.baseUrl}/api/ui/widgets`;
  events = `${server.baseUrl}/api/ui/events`;
});

beforeEach(() => {
  resetHubForTesting();
  resetWidgetStoreForTesting();
});

afterAll(async () => {
  await server.close();
});

interface Snapshot {
  epoch: string;
  version: number;
  widgets: Widget[];
}

/**
 * @returns The snapshot GET /api/ui/widgets answers
 */
async function getSnapshot(): Promise<Snapshot> {
  const response = await fetch(widgets);

  return (await response.json()) as Snapshot;
}

/**
 * @param url - What to request
 * @param init - Request options
 * @returns The response status
 */
async function statusOf(url: string, init?: RequestInit): Promise<number> {
  const response = await fetch(url, init);

  return response.status;
}

describe("/api/ui/widgets", () => {
  it("creates, lists, updates and deletes", async () => {
    const created = await postJson(widgets, { kind: "clip", ref: "t0/s0" });

    expect(created.status).toBe(201);
    expect(await created.json()).toStrictEqual({
      widget: { id: "w1", kind: "clip", ref: "t0/s0" },
    });

    const updated = await putJson(`${widgets}/w1`, { title: "Lead" });

    expect(updated.status).toBe(200);

    const listed = await getSnapshot();

    expect(listed.version).toBe(2);
    expect(listed.widgets).toStrictEqual([
      { id: "w1", kind: "clip", ref: "t0/s0", title: "Lead" },
    ]);

    expect(await statusOf(`${widgets}/w1`, { method: "DELETE" })).toBe(200);
    const afterDelete = await getSnapshot();

    expect(afterDelete.widgets).toStrictEqual([]);
  });

  it("answers 400 for a bad widget and 404 for an unknown id", async () => {
    const bad = await postJson(widgets, { kind: "clip", ref: "nope" });
    const notAnObject = await postJson(widgets, "not an object");
    const unknownPut = await putJson(`${widgets}/w9`, { title: "x" });

    expect(bad.status).toBe(400);
    expect(await errorOf(bad)).toContain("needs a ref");
    expect(notAnObject.status).toBe(400);
    expect(unknownPut.status).toBe(404);
    expect(await statusOf(`${widgets}/w9`, { method: "DELETE" })).toBe(404);
  });

  it("refuses writes from another site, but not reads", async () => {
    const origin = "https://evil.example";
    const post = await postJson(widgets, { kind: "text", text: "x" }, origin);
    const put = await putJson(`${widgets}/w1`, {}, origin);

    expect(post.status).toBe(403);
    expect(put.status).toBe(403);
    expect(
      await statusOf(`${widgets}/w1`, {
        method: "DELETE",
        headers: { Origin: origin },
      }),
    ).toBe(403);
    expect(await statusOf(widgets, { headers: { Origin: origin } })).toBe(200);
  });
});

describe("/api/ui/events", () => {
  it("opens with a snapshot, then sends each change with the next version", async () => {
    await postJson(widgets, { kind: "text", text: "before" });

    const stream = await openEventStream(events);

    try {
      const snapshot = await stream.next();

      expect(snapshot.type).toBe("snapshot");
      expect(snapshot.version).toBe(1);

      await postJson(widgets, { kind: "text", text: "after" });
      await putJson(`${widgets}/w2`, { text: "edited" });
      await fetch(`${widgets}/w1`, { method: "DELETE" });

      const changes = [
        await stream.next(),
        await stream.next(),
        await stream.next(),
      ];

      expect(changes.map((e) => [e.type, e.version])).toStrictEqual([
        ["widget", 2],
        ["widget", 3],
        ["widget", 4],
      ]);
      expect(changes[2]).toStrictEqual({
        type: "widget",
        version: 4,
        change: { op: "remove", id: "w1" },
      });
    } finally {
      await stream.close();
    }
  });

  it("gives a reconnecting viewer a fresh snapshot, so a gap shows in the version", async () => {
    const first = await openEventStream(events);
    const opening = await first.next();

    await first.close();

    // Changes made while no viewer is connected.
    await postJson(widgets, { kind: "text", text: "missed 1" });
    await postJson(widgets, { kind: "text", text: "missed 2" });

    const second = await openEventStream(events);

    try {
      const again = (await second.next()) as Extract<
        GenUiEvent,
        { type: "snapshot" }
      >;

      expect(opening.version).toBe(0);
      expect(again.type).toBe("snapshot");
      expect(again.version).toBe(2);
      expect(again.widgets).toHaveLength(2);
    } finally {
      await second.close();
    }
  });

  it("serves every connected viewer, and keeps going after one leaves", async () => {
    const a = await openEventStream(events);
    const b = await openEventStream(events);

    await a.next();
    await b.next();
    await a.close();

    await postJson(widgets, { kind: "text", text: "x" });

    const heard = await b.next();

    expect(heard.type).toBe("widget");
    expect(heard.version).toBe(1);
    await b.close();
  });

  it("sends a comment now and then so an idle stream isn't dropped", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });

    const stream = await openEventStream(events);

    try {
      await stream.next();
      await vi.advanceTimersByTimeAsync(25_000);

      expect(await stream.nextBlock()).toBe(": ping");
    } finally {
      vi.useRealTimers();
      await stream.close();
    }
  });

  it("lets a viewer that fell behind reload the full state", async () => {
    const stream = await openEventStream(events);

    await stream.next();
    await postJson(widgets, { kind: "text", text: "a" });
    await postJson(widgets, { kind: "text", text: "b" });

    // It read only the snapshot, so the jump to version 2 is what a lost event looks like.
    const reload = await getSnapshot();

    expect(reload.version).toBe(2);
    expect(reload.widgets).toHaveLength(2);
    await stream.close();
  });
});
