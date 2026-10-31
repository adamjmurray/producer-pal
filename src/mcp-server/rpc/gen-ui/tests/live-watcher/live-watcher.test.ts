// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ClipWidget, type GenUiEvent } from "#src/shared/gen-ui-types.ts";
import { type RemoteScriptRequest } from "../../../remote-script/remote-script-client.ts";
import {
  clipInput,
  type FakeScript,
  resetForWatcherTest,
} from "../gen-ui-test-helpers.ts";
import { RemoteScriptTimeout } from "../../../remote-script/remote-script-errors.ts";
import { getSync, setSync, subscribe } from "../../gen-ui-hub.ts";
import { encodeWidgets } from "../../widget-blob.ts";
import {
  LiveWatcher,
  POLL_MS,
  REFUSED_RETRY_MS,
  RETRY_MS,
  type WatcherDeps,
} from "../../live-watcher.ts";
import {
  createWidget,
  listWidgets,
  loadWidgetsFromSet,
  removeWidget,
  updateClipState,
  updateWidget,
} from "../../widget-store.ts";

let script: FakeScript;
let published: GenUiEvent[];
let syncs: Array<{ mode: string; detail: string }>;
let now: number;
let watcher: LiveWatcher;

/** @returns Deps wired to the fake script, with the real widget store */
function deps(): WatcherDeps {
  return {
    request: script.request,
    listWidgets,
    updateClipState,
    publish: ((event: GenUiEvent) => {
      published.push(event);

      return event;
    }) as unknown as WatcherDeps["publish"],
    setSync: (sync) => syncs.push(sync),
    now: () => now,
  };
}

beforeEach(() => {
  script = resetForWatcherTest({
    "t0/s0": { name: "Bass", length: 8 },
    "t1/s1": { name: "Lead", length: 4 },
  });
  published = [];
  syncs = [];
  now = 0;
  watcher = new LiveWatcher(deps());
});

afterEach(() => {
  watcher.stop();
  vi.useRealTimers();
});

const clip = clipInput;

/**
 * Swap in a watcher whose requests go through `request`, and watch t0/s0.
 * @param request - Wraps the fake script's request
 */
async function restartWatching(request: WatcherDeps["request"]): Promise<void> {
  watcher.stop();
  watcher = new LiveWatcher({ ...deps(), request });
  watcher.start();
  createWidget(clip("t0/s0"));
  await vi.advanceTimersByTimeAsync(0);
}

const lives = (): GenUiEvent[] => published.filter((e) => e.type === "live");

const widget = (id: string): ClipWidget => {
  const found = listWidgets().find((w) => w.id === id);

  return found as ClipWidget;
};

const allRefreshes = (): number =>
  lives().filter((e) => e.type === "live" && e.all).length;

describe("registering", () => {
  it("watches a path widget and keeps the fingerprint the script reports", async () => {
    createWidget(clip("t0/s0"));
    createWidget({ kind: "text", text: "hi" });
    await watcher.tick();

    expect(script.routes("/watch").map((r) => r.body)).toStrictEqual([
      { owner: "w1", path: "t0/s0" },
    ]);
    expect(widget("w1").fingerprint).toStrictEqual({ name: "Bass", length: 8 });
  });

  it("leaves an id ref from before widgets were kept by path alone", async () => {
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

    // The first contact asks once to learn the script's epoch.
    expect(script.routes("/watch")).toHaveLength(1);
    expect(script.routes("/events")).toHaveLength(3);
  });

  it("tries a full script again later, and not before", async () => {
    script.limit = true;
    createWidget(clip("t0/s0"));
    await watcher.tick();
    await watcher.tick();

    expect(script.routes("/watch")).toHaveLength(1);
    expect(widget("w1").gone).toBeUndefined();

    script.limit = false;
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

describe("a widget follows its clip", () => {
  beforeEach(() => {
    watcher.start();
  });

  it("takes the new path when the clip moves, without watching again", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    script.emit("w1", "moved", { path: "t1/s0" });
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(widget("w1").ref).toBe("t1/s0");
    expect(widget("w1").gone).toBeUndefined();
    expect(script.routes("/watch")).toHaveLength(1);
    expect(script.routes("/unwatch")).toHaveLength(0);
    expect(lives()).toStrictEqual([
      {
        type: "live",
        tool: "remote-script",
        ids: [],
        paths: ["t1/s0", "t0/s0"],
        all: false,
      },
    ]);
  });

  it("keeps hearing about the clip after it moved", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    script.emit("w1", "moved", { path: "t1/s0" });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    script.emit("w1");
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(lives().at(-1)).toStrictEqual({
      type: "live",
      tool: "remote-script",
      ids: [],
      paths: ["t1/s0"],
      all: false,
    });
  });

  it("ignores a move to something that isn't a Session path", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    script.emit("w1", "moved", { path: "t0[5|1]" });
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(widget("w1").ref).toBe("t0/s0");
  });

  it("marks the widget gone when the clip is deleted, and it stays gone", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    script.slots["t0/s0"] = undefined;
    script.emit("w1", "gone", { reason: "dead" });
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(widget("w1").gone).toBe(true);

    // Something else lands in the slot. The widget does not take it.
    script.slots["t0/s0"] = { name: "Bass", length: 8 };
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);

    expect(widget("w1").gone).toBe(true);
    expect(script.routes("/watch")).toHaveLength(1);
  });

  it("stops polling once every clip is gone", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    script.emit("w1", "gone");
    await vi.advanceTimersByTimeAsync(POLL_MS);
    const settled = script.requests.length;

    await vi.advanceTimersByTimeAsync(POLL_MS * 5);

    expect(script.requests).toHaveLength(settled);
  });

  it("shows an empty slot at creation as gone, since there is no clip to follow", async () => {
    createWidget(clip("t5/s5"));
    await vi.advanceTimersByTimeAsync(0);

    expect(widget("w1").gone).toBe(true);
  });

  it("follows a new ref the AI gives it, and forgets what it knew", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    updateWidget("w1", { ref: "t1/s1" });
    await vi.advanceTimersByTimeAsync(0);

    expect(script.routes("/unwatch")).toHaveLength(1);
    expect(script.routes("/watch").at(-1)?.body).toStrictEqual({
      owner: "w1",
      path: "t1/s1",
    });
    expect(widget("w1").fingerprint).toStrictEqual({ name: "Lead", length: 4 });
  });

  it("follows again a gone widget the AI points at another clip", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    script.emit("w1", "gone");
    await vi.advanceTimersByTimeAsync(POLL_MS);
    updateWidget("w1", { ref: "t1/s1" });
    await vi.advanceTimersByTimeAsync(0);

    expect(widget("w1").gone).toBeUndefined();
    expect(script.watching.has("w1")).toBe(true);
  });
});

describe("after a restart or a Set change", () => {
  const widgetsAt = async (): Promise<void> => {
    createWidget(clip("t0/s0"));
    createWidget(clip("t1/s1"));
    await watcher.tick();
  };

  it("binds again from the last path when the clip there still matches", async () => {
    await widgetsAt();
    script.restart();
    script.requests.length = 0;
    await watcher.tick();

    expect(script.routes("/watch").map((r) => r.body)).toStrictEqual([
      { owner: "w1", path: "t0/s0", fingerprint: { name: "Bass", length: 8 } },
      { owner: "w2", path: "t1/s1", fingerprint: { name: "Lead", length: 4 } },
    ]);
    expect(widget("w1").gone).toBeUndefined();
    expect(widget("w2").gone).toBeUndefined();
  });

  it("shows a different clip at the path as gone, not as a wrong clip", async () => {
    await widgetsAt();
    script.restart();
    script.slots["t0/s0"] = { name: "Drums", length: 8 };
    script.slots["t1/s1"] = { name: "Lead", length: 16 };
    await watcher.tick();

    expect(widget("w1").gone).toBe(true);
    expect(widget("w2").gone).toBe(true);
    expect(script.watching.size).toBe(0);
  });

  it("shows an empty slot as gone", async () => {
    await widgetsAt();
    script.restart();
    script.slots["t0/s0"] = undefined;
    await watcher.tick();

    expect(widget("w1").gone).toBe(true);
    expect(widget("w2").gone).toBeUndefined();
  });

  it("judges a gone widget again, so a verdict from another Set doesn't stick", async () => {
    await widgetsAt();
    updateClipState("w2", { gone: true });
    script.restart();
    await watcher.tick();

    expect(widget("w2").gone).toBeUndefined();
    expect(script.watching.has("w2")).toBe(true);
  });

  it("judges a deleted clip's widget gone again", async () => {
    await widgetsAt();
    script.slots["t1/s1"] = undefined;
    script.emit("w2", "gone");
    await watcher.tick();
    script.restart();
    script.slots["t1/s1"] = undefined;
    await watcher.tick();

    expect(widget("w2").gone).toBe(true);
  });

  it("refreshes every clip once it has bound again", async () => {
    await widgetsAt();
    script.restart();
    published.length = 0;
    script.requests.length = 0;
    await watcher.tick();

    expect(allRefreshes()).toBe(1);

    const order = script.requests.map((r) => r.route);

    expect(order.lastIndexOf("/events")).toBeLessThan(order.indexOf("/watch"));
  });
});

describe("events", () => {
  it("passes each change on as a live event naming the widget's clip", async () => {
    createWidget(clip("t0/s0"));
    createWidget(clip("t1/s1"));
    await watcher.tick();
    script.emit("w1");
    script.emit("w2");
    await watcher.tick();

    expect(lives()).toStrictEqual([
      {
        type: "live",
        tool: "remote-script",
        ids: [],
        paths: ["t0/s0"],
        all: false,
      },
      {
        type: "live",
        tool: "remote-script",
        ids: [],
        paths: ["t1/s1"],
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
      undefined,
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
});

describe("falling back to refreshing everything", () => {
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
    expect(widget("w1").gone).toBeUndefined();
  });

  it("treats a timeout or a dropped connection the same way", async () => {
    createWidget(clip("t0/s0"));
    watcher = new LiveWatcher({
      ...deps(),
      request: () => Promise.reject(new RemoteScriptTimeout("slow", true)),
    });

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
    expect(allRefreshes()).toBe(1);
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

  it("unwatches a gone widget's record when the widget is removed", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    script.emit("w1", "gone");
    await vi.advanceTimersByTimeAsync(POLL_MS);
    removeWidget("w1");
    await vi.advanceTimersByTimeAsync(0);

    expect(script.routes("/unwatch")).toHaveLength(1);
  });

  it("watches the Set's clips, and the early ones again under their new ids, when the Set's list arrives", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);

    loadWidgetsFromSet(
      encodeWidgets([{ id: "w7", kind: "clip", ref: "t1/s1" }]) as string,
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(script.routes("/unwatch").map((r) => r.body)).toStrictEqual([
      { owner: "w1" },
    ]);
    expect([...script.watching].toSorted()).toStrictEqual(["w7", "w8"]);
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

  it("stops following after stop()", async () => {
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
 * A script that answers every /watch and /events with fixed bodies.
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

describe("rounds that overlap or are overtaken", () => {
  it("ignores a round asked for while one is running", async () => {
    createWidget(clip("t0/s0"));

    await Promise.all([watcher.tick(), watcher.tick()]);

    // One round: the first-contact probe, and the poll.
    expect(script.routes("/events")).toHaveLength(2);
  });

  it("goes again at once when a widget arrives mid-round", async () => {
    let added = false;

    const request: WatcherDeps["request"] = (r) => {
      if (r.route === "/watch" && !added) {
        added = true;
        createWidget(clip("t1/s1"));
      }

      return script.request(r);
    };

    await restartWatching(request);
    await vi.advanceTimersByTimeAsync(1);

    expect([...script.watching].toSorted()).toStrictEqual(["w1", "w2"]);
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
    const request: WatcherDeps["request"] = (r) => {
      if (r.route === "/unwatch") {
        throw new Error("broken");
      }

      return script.request(r);
    };

    await restartWatching(request);
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

  it("polls from the start after a new epoch with no sequence number", async () => {
    const odd = oddScript({ ok: true, epoch: "e10" }, { epoch: "e9", seq: 5 });
    const sinces: unknown[] = [];

    watcher.stop();
    createWidget(clip("t0/s0"));
    watcher = new LiveWatcher({
      ...deps(),
      request: (request) => {
        if (request.route === "/events") {
          sinces.push(request.query?.since);
        }

        return odd(request);
      },
    });

    await watcher.tick();

    // The probe asks without `since`; the poll follows the watch's new epoch.
    expect(sinces).toStrictEqual([undefined, "0"]);
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
