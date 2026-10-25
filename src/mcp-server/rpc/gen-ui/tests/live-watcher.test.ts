// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type GenUiEvent } from "#src/shared/gen-ui-types.ts";
import { RemoteScriptTimeout } from "../../remote-script/remote-script-errors.ts";
import {
  type RemoteScriptReply,
  type RemoteScriptRequest,
  setRemoteScriptEnabled,
} from "../../remote-script/remote-script-client.ts";
import { mcpRequests, setMcpResponse } from "#src/test/mocks/mock-max.ts";
import {
  getSync,
  resetHubForTesting,
  setSync,
  subscribe,
} from "../gen-ui-hub.ts";
import {
  LiveWatcher,
  POLL_MS,
  REFUSED_RETRY_MS,
  RETRY_MS,
  resolveClipPath,
  startLiveWatcher,
  stopLiveWatcher,
  type WatcherDeps,
} from "../live-watcher.ts";
import {
  createWidget,
  listWidgets,
  removeWidget,
  resetWidgetStoreForTesting,
  updateWidget,
} from "../widget-store.ts";

/** Stands in for the remote script's /watch, /unwatch and /events. */
class FakeScript {
  epoch = "e1";
  seq = 0;
  watching = new Set<string>();
  events: Array<Record<string, unknown>> = [];
  down: false | { outdated?: string } = false;
  refuse: number | null = null;
  resync = false;
  requests: RemoteScriptRequest[] = [];

  request = (request: RemoteScriptRequest): Promise<RemoteScriptReply> => {
    this.requests.push(request);

    if (this.down) {
      return Promise.resolve({
        available: false,
        ...(this.down.outdated == null ? {} : { outdated: this.down.outdated }),
      });
    }

    return Promise.resolve({
      available: true,
      ...this.answer(request),
    });
  };

  restart(): void {
    this.epoch = "e2";
    this.seq = 0;
    this.watching.clear();
    this.events = [];
  }

  emit(owner: string, kind = "changed"): void {
    this.seq += 1;
    this.events.push({ seq: this.seq, owner, kind, fields: ["notes"] });
  }

  routes(route: string): RemoteScriptRequest[] {
    return this.requests.filter((r) => r.route === route);
  }

  private answer(request: RemoteScriptRequest): {
    status: number;
    body: Record<string, unknown>;
  } {
    const body = (request.body ?? {}) as { owner?: string };

    if (request.route === "/watch") {
      if (this.refuse != null) {
        return { status: this.refuse, body: { error: "refused" } };
      }

      this.watching.add(String(body.owner));

      return {
        status: 200,
        body: { ok: true, epoch: this.epoch, seq: this.seq },
      };
    }

    if (request.route === "/unwatch") {
      this.watching.delete(String(body.owner));

      return { status: 200, body: { existed: true } };
    }

    const since = Number(request.query?.since ?? 0);
    const resync = this.resync;

    this.resync = false;

    return {
      status: 200,
      body: {
        epoch: this.epoch,
        seq: this.seq,
        resync,
        events: resync ? [] : this.events.filter((e) => Number(e.seq) > since),
        watching: [...this.watching],
      },
    };
  }
}

let script: FakeScript;
let published: GenUiEvent[];
let syncs: Array<{ mode: string; detail: string }>;
let paths: Record<string, string | null>;
let now: number;
let watcher: LiveWatcher;

/**
 * @returns Deps wired to the fake script, with the real widget store
 */
function deps(): WatcherDeps {
  return {
    request: script.request,
    resolvePath: (id) => Promise.resolve(paths[id] ?? null),
    listWidgets,
    publish: ((event: GenUiEvent) => {
      published.push(event);

      return event;
    }) as unknown as WatcherDeps["publish"],
    setSync: (sync) => syncs.push(sync),
    now: () => now,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHubForTesting();
  resetWidgetStoreForTesting();
  script = new FakeScript();
  published = [];
  syncs = [];
  paths = {};
  now = 0;
  watcher = new LiveWatcher(deps());
});

afterEach(() => {
  watcher.stop();
  vi.useRealTimers();
});

const clip = (ref: string): Record<string, unknown> => ({ kind: "clip", ref });

const lives = (): GenUiEvent[] => published.filter((e) => e.type === "live");

describe("registering", () => {
  it("watches path widgets by slot, and ignores text widgets", async () => {
    createWidget(clip("t0/s3"));
    createWidget({ kind: "text", text: "hi" });
    await watcher.tick();

    expect(script.routes("/watch").map((r) => r.body)).toStrictEqual([
      { owner: "w1", path: "t0/s3", follow: true },
    ]);
  });

  it("pins an id widget to the clip, by the slot it is in now", async () => {
    paths["12"] = "t2/s1";
    createWidget(clip("12"));
    await watcher.tick();

    expect(script.routes("/watch")[0]?.body).toStrictEqual({
      owner: "w1",
      path: "t2/s1",
      follow: false,
    });
  });

  it("leaves a clip it can't place to the write-triggered refresh", async () => {
    createWidget(clip("12"));
    await watcher.tick();
    await watcher.tick();

    expect(script.routes("/watch")).toHaveLength(0);
    expect(syncs.at(-1)?.detail).toContain("0 of 1");
  });

  it("registers a widget once, not on every round", async () => {
    createWidget(clip("t0/s0"));
    await watcher.tick();
    await watcher.tick();

    expect(script.routes("/watch")).toHaveLength(1);
    expect(script.routes("/events")).toHaveLength(2);
  });

  it("tries a refused watch again later, and not before", async () => {
    script.refuse = 409;
    createWidget(clip("t0/s0"));
    await watcher.tick();
    await watcher.tick();

    expect(script.routes("/watch")).toHaveLength(1);

    script.refuse = null;
    now += REFUSED_RETRY_MS;
    await watcher.tick();

    expect(script.watching.has("w1")).toBe(true);
  });

  it("does no work with no clip widgets", async () => {
    createWidget({ kind: "text", text: "hi" });
    await watcher.tick();

    expect(script.requests).toStrictEqual([]);
    expect(syncs).toStrictEqual([]);
  });
});

describe("events", () => {
  it("passes each change on as a live event naming the widget's clip", async () => {
    paths["12"] = "t0/s0";
    createWidget(clip("t1/s1"));
    createWidget(clip("12"));
    await watcher.tick();
    script.emit("w1");
    script.emit("w2");
    await watcher.tick();

    expect(lives()).toStrictEqual([
      {
        type: "live",
        tool: "remote-script",
        ids: [],
        paths: ["t1/s1"],
        all: false,
      },
      {
        type: "live",
        tool: "remote-script",
        ids: ["12"],
        paths: [],
        all: false,
      },
    ]);
  });

  it("asks only for what is new", async () => {
    createWidget(clip("t0/s0"));
    await watcher.tick();
    script.emit("w1");
    await watcher.tick();
    await watcher.tick();

    expect(script.routes("/events").map((r) => r.query?.since)).toStrictEqual([
      "0",
      "0",
      "1",
    ]);
    expect(lives()).toHaveLength(1);
  });

  it("ignores events for widgets that are gone", async () => {
    createWidget(clip("t0/s0"));
    await watcher.tick();
    script.emit("w9");
    await watcher.tick();

    expect(lives()).toStrictEqual([]);
  });

  it("reports that it is listening", async () => {
    createWidget(clip("t0/s0"));
    await watcher.tick();

    expect(syncs.at(-1)?.mode).toBe("listening");
  });

  it("does not watch again a clip the script says is gone, until its widget changes", async () => {
    watcher.start();
    paths["12"] = "t0/s0";
    createWidget(clip("12"));
    await watcher.tick();
    script.watching.clear();
    script.emit("w1", "gone");
    await watcher.tick();
    await watcher.tick();

    expect(script.routes("/watch")).toHaveLength(1);
    expect(lives()).toHaveLength(1);

    updateWidget("w1", { title: "x" });
    await watcher.tick();

    expect(script.routes("/watch")).toHaveLength(2);
  });
});

describe("falling back to refreshing everything", () => {
  const allRefreshes = (): number =>
    lives().filter((e) => e.type === "live" && e.all).length;

  it("after a queue overflow", async () => {
    createWidget(clip("t0/s0"));
    await watcher.tick();
    script.seq = 10;
    script.resync = true;
    await watcher.tick();
    await watcher.tick();

    expect(allRefreshes()).toBe(1);
    expect(script.routes("/events").at(-1)?.query?.since).toBe("10");
  });

  it("after a sequence number goes backwards", async () => {
    createWidget(clip("t0/s0"));
    script.seq = 8;
    await watcher.tick();
    script.seq = 2;
    await watcher.tick();

    expect(allRefreshes()).toBe(1);
  });

  it("after the script restarts, once it has registered again", async () => {
    createWidget(clip("t0/s0"));
    await watcher.tick();
    script.restart();
    published.length = 0;
    script.requests.length = 0;
    await watcher.tick();

    expect(script.watching.has("w1")).toBe(true);
    expect(allRefreshes()).toBe(1);
    const order = script.requests.map((r) => r.route);

    expect(order.indexOf("/watch")).toBeGreaterThan(-1);
    expect(order.lastIndexOf("/events")).toBeLessThan(order.indexOf("/watch"));
  });

  it("registers again a watch the script lost on its own", async () => {
    createWidget(clip("t0/s0"));
    await watcher.tick();
    script.watching.clear();
    await watcher.tick();
    await watcher.tick();

    expect(script.routes("/watch")).toHaveLength(2);
  });
});

describe("when the remote script is not there", () => {
  it("says so, keeps going, and doesn't throw", async () => {
    script.down = { outdated: "the remote script is out of date" };
    createWidget(clip("t0/s0"));

    await expect(watcher.tick()).resolves.toBeUndefined();

    expect(syncs.at(-1)).toStrictEqual({
      mode: "writes-only",
      detail:
        "Clips refresh after AI changes only (the remote script is out of date).",
    });
  });

  it("treats a timeout or a dropped connection the same way", async () => {
    createWidget(clip("t0/s0"));
    script.request = () =>
      Promise.reject(new RemoteScriptTimeout("slow", true));
    watcher = new LiveWatcher({ ...deps(), request: script.request });

    await expect(watcher.tick()).resolves.toBeUndefined();
    expect(syncs.at(-1)?.mode).toBe("writes-only");
  });

  it("treats an unusable reply the same way", async () => {
    createWidget(clip("t0/s0"));
    script.request = () =>
      Promise.resolve({ available: true, status: 500, body: {} });
    watcher = new LiveWatcher({ ...deps(), request: script.request });
    await watcher.tick();

    expect(syncs.at(-1)?.mode).toBe("writes-only");
  });

  it("retries slowly, then refreshes every clip when it comes back", async () => {
    script.down = {};
    createWidget(clip("t0/s0"));
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(script.requests).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(RETRY_MS - 1);

    expect(script.requests).toHaveLength(1);

    script.down = false;
    await vi.advanceTimersByTimeAsync(1);

    expect(syncs.at(-1)?.mode).toBe("listening");
    expect(lives().filter((e) => e.type === "live" && e.all)).toHaveLength(1);
  });

  it("polls at the normal pace while it answers", async () => {
    createWidget(clip("t0/s0"));
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    const before = script.routes("/events").length;

    await vi.advanceTimersByTimeAsync(POLL_MS * 3);

    expect(script.routes("/events")).toHaveLength(before + 3);
  });
});

describe("following the widgets", () => {
  beforeEach(() => {
    watcher.start();
  });

  it("watches a clip widget as it is created", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);

    expect(script.watching.has("w1")).toBe(true);
  });

  it("unwatches a widget as it is removed, and stops polling with no clips left", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    removeWidget("w1");
    await vi.advanceTimersByTimeAsync(POLL_MS);
    const settled = script.requests.length;

    await vi.advanceTimersByTimeAsync(POLL_MS * 5);

    expect(script.watching.has("w1")).toBe(false);
    expect(script.routes("/unwatch")).toHaveLength(1);
    expect(script.requests).toHaveLength(settled);
  });

  it("moves the watch when the widget's ref changes", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    updateWidget("w1", { ref: "t3/s3" });
    await vi.advanceTimersByTimeAsync(0);

    expect(script.routes("/unwatch")).toHaveLength(1);
    expect(script.routes("/watch").at(-1)?.body).toStrictEqual({
      owner: "w1",
      path: "t3/s3",
      follow: true,
    });
  });

  it("leaves the watch alone when only the title changes", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    updateWidget("w1", { title: "Bass" });
    await vi.advanceTimersByTimeAsync(0);

    expect(script.routes("/unwatch")).toHaveLength(0);
    expect(script.routes("/watch")).toHaveLength(1);
  });

  it("doesn't mind an unwatch the script never gets", async () => {
    watcher.stop();

    const rejecting = vi.fn((request: RemoteScriptRequest) =>
      request.route === "/unwatch"
        ? Promise.reject(new Error("connection lost"))
        : script.request(request),
    );

    watcher = new LiveWatcher({ ...deps(), request: rejecting });
    watcher.start();
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    removeWidget("w1");
    await vi.advanceTimersByTimeAsync(0);

    expect(rejecting).toHaveBeenCalledWith(
      expect.objectContaining({ route: "/unwatch" }),
    );
  });

  it("ignores status and live events, and stops following after stop()", async () => {
    const seen: string[] = [];

    subscribe((event) => seen.push(event.type));
    watcher.stop();
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    expect(script.requests).toStrictEqual([]);
  });

  it("starts once however often it is asked", async () => {
    watcher.start();
    watcher.start();
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);

    expect(script.routes("/watch")).toHaveLength(1);
  });
});

/**
 * A script that answers every /watch and /events, with whatever `body` says.
 * @param watch - The /watch body
 * @param events - The /events body
 * @returns A request function for WatcherDeps
 */
function oddScript(
  watch: Record<string, unknown>,
  events: Record<string, unknown>,
): WatcherDeps["request"] {
  return (request) =>
    Promise.resolve({
      available: true,
      status: 200,
      body: request.route === "/watch" ? watch : events,
    });
}

/**
 * Replace the watcher with a started one whose requests pass `see` first, which
 * may do things to the world or throw before the fake script answers.
 * @param see - Called with each request
 */
function startWatcherSeeing(see: (request: RemoteScriptRequest) => void): void {
  watcher.stop();
  watcher = new LiveWatcher({
    ...deps(),
    request: (r) => {
      see(r);

      return script.request(r);
    },
  });
  watcher.start();
}

describe("rounds that overlap or are overtaken", () => {
  it("ignores a round asked for while one is running", async () => {
    createWidget(clip("t0/s0"));

    await Promise.all([watcher.tick(), watcher.tick()]);

    expect(script.routes("/events")).toHaveLength(1);
  });

  it("goes again at once when a widget arrives mid-round", async () => {
    let added = false;

    startWatcherSeeing((r) => {
      if (r.route === "/watch" && !added) {
        added = true;
        createWidget(clip("t1/s1"));
      }
    });
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1);

    expect([...script.watching].toSorted()).toStrictEqual(["w1", "w2"]);
  });

  it("says nothing when the last clip widget goes during the round", async () => {
    createWidget(clip("t0/s0"));
    startWatcherSeeing((r) => {
      if (r.route === "/events") {
        removeWidget("w1");
      }
    });
    await watcher.tick();

    expect(syncs).toStrictEqual([]);
  });

  it("refreshes once, not twice, when the script is back and restarted", async () => {
    createWidget(clip("t0/s0"));
    await watcher.tick();
    script.down = {};
    await watcher.tick();
    script.down = false;
    script.restart();
    published.length = 0;
    await watcher.tick();

    expect(lives().filter((e) => e.type === "live" && e.all)).toHaveLength(1);
  });

  it("stays quiet about a script that keeps being down", async () => {
    script.down = {};
    createWidget(clip("t0/s0"));
    await watcher.tick();
    await watcher.tick();

    expect(syncs).toHaveLength(2);
    expect(syncs.at(-1)?.mode).toBe("writes-only");
  });
});

describe("widgets that are not clips, and removals that fail", () => {
  it("ignores a text widget, and a removal of one it never watched", async () => {
    watcher.start();
    createWidget({ kind: "text", text: "hi" });
    removeWidget("w1");
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(script.requests).toStrictEqual([]);
  });

  it("survives a request function that throws instead of rejecting", async () => {
    startWatcherSeeing((r) => {
      if (r.route === "/unwatch") {
        throw new Error("broken");
      }
    });
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    removeWidget("w1");
    createWidget(clip("t1/s1"));
    await vi.advanceTimersByTimeAsync(1);

    expect(script.watching.has("w2")).toBe(true);
  });
});

describe("replies with parts missing", () => {
  it("copes with no sequence number, no events and no watch list", async () => {
    watcher.stop();
    createWidget(clip("t0/s0"));
    watcher = new LiveWatcher({
      ...deps(),
      request: oddScript({ ok: true, epoch: "e9" }, { epoch: "e9", seq: 0 }),
    });

    await watcher.tick();

    expect(syncs.at(-1)?.mode).toBe("listening");
    expect(lives()).toStrictEqual([]);
  });
});

describe("status changes", () => {
  it("tells viewers about a status once, however often it is set", () => {
    const seen: string[] = [];

    subscribe((event) => seen.push(event.type));
    setSync({ mode: "listening", detail: "on" });
    setSync({ mode: "listening", detail: "on" });

    expect(seen).toStrictEqual(["status"]);
    expect(getSync().detail).toBe("on");
  });
});

describe("the real lookup of a clip's slot by id", () => {
  // The Live mock answers on a real timer.
  beforeEach(() => {
    vi.useRealTimers();
  });

  const reply = (text: string): unknown => ({
    content: [{ type: "text", text }],
  });

  it("asks Live for the clip and returns its Session path", async () => {
    setMcpResponse(reply('{"id":"12","path":"t2/s1"}'));

    expect(await resolveClipPath("12")).toBe("t2/s1");
    expect(mcpRequests.map((r) => r.tool)).toContain("ppal-read-clip");
  });

  it.each([
    ["no answer text", { content: [] }],
    ["an arrangement clip", reply('{"id":"12","path":"t0[5|1]"}')],
    ["an answer that isn't JSON", reply("Error: no such clip")],
  ])("finds no path for %s", async (_name, answer) => {
    setMcpResponse(answer);

    expect(await resolveClipPath("12")).toBeNull();
  });

  it("is the lookup the shared watcher uses", async () => {
    vi.useFakeTimers();
    setRemoteScriptEnabled(false);
    setMcpResponse(reply('{"id":"12","path":"t2/s1"}'));
    createWidget(clip("12"));
    startLiveWatcher();
    await vi.advanceTimersByTimeAsync(10);
    stopLiveWatcher();
    setRemoteScriptEnabled(true);

    expect(mcpRequests.map((r) => r.tool)).toContain("ppal-read-clip");
  });
});
