// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ClipWidget } from "#src/shared/gen-ui-types.ts";
import {
  clipInput,
  type FakeScript,
  resetForWatcherTest,
} from "../gen-ui-test-helpers.ts";
import { LiveWatcher, POLL_MS, type WatcherDeps } from "../../live-watcher.ts";
import {
  createWidget,
  listWidgets,
  updateClipState,
} from "../../widget-store.ts";

let script: FakeScript;
let watcher: LiveWatcher;

/**
 * @param update - The widget update to use
 * @returns Deps wired to the fake script, with the real widget store
 */
function deps(update: typeof updateClipState = updateClipState): WatcherDeps {
  return {
    request: script.request,
    listWidgets,
    updateClipState: update,
    publish: vi.fn(),
    setSync: vi.fn(),
    now: () => 0,
  } as unknown as WatcherDeps;
}

beforeEach(() => {
  script = resetForWatcherTest({ "t0/s0": { name: "Bass", length: 8 } });
  watcher = new LiveWatcher(deps());
});

afterEach(() => {
  watcher.stop();
  vi.useRealTimers();
});

const clip = clipInput;

/**
 * @param kind - The kind of event the script reports
 * @param extra - Fields to add to the event
 */
async function report(kind: string, extra: object): Promise<void> {
  script.emit("w1", kind, extra);
  await vi.advanceTimersByTimeAsync(POLL_MS);
}

const widget = (id: string): ClipWidget =>
  listWidgets().find((w) => w.id === id) as ClipWidget;

describe("keeping the fingerprint current", () => {
  beforeEach(() => {
    watcher.start();
  });

  it("stores a new name or length when a change reports one", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    await report("changed", { fingerprint: { name: "Bass2", length: 8 } });

    expect(widget("w1").fingerprint).toStrictEqual({
      name: "Bass2",
      length: 8,
    });

    await report("changed", { fingerprint: { name: "Bass2", length: 4 } });

    expect(widget("w1").fingerprint).toStrictEqual({
      name: "Bass2",
      length: 4,
    });
    expect(widget("w1").ref).toBe("t0/s0");
  });

  it("keeps watching the same clip after the update", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    await report("changed", { fingerprint: { name: "Bass2", length: 8 } });

    expect(script.routes("/watch")).toHaveLength(1);
    expect(script.routes("/unwatch")).toHaveLength(0);
  });

  it("stores it from a move too", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    await report("moved", {
      path: "t1/s0",
      fingerprint: { name: "Bass2", length: 8 },
    });

    expect(widget("w1").ref).toBe("t1/s0");
    expect(widget("w1").fingerprint).toStrictEqual({
      name: "Bass2",
      length: 8,
    });
  });

  it("writes nothing when the fingerprint is unchanged", async () => {
    const update = vi.fn(updateClipState);

    watcher.stop();
    watcher = new LiveWatcher(deps(update));
    watcher.start();
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    update.mockClear();

    await report("changed", { fingerprint: { name: "Bass", length: 8 } });
    await report("changed", {
      fingerprint: { name: "Bass", length: 8 + 1e-6 },
    });

    expect(update).not.toHaveBeenCalled();
  });

  it("ignores a fingerprint on a gone event, and a malformed one", async () => {
    createWidget(clip("t0/s0"));
    await vi.advanceTimersByTimeAsync(0);
    await report("changed", { fingerprint: { name: 5 } });
    await report("gone", { fingerprint: { name: "Other", length: 1 } });

    expect(widget("w1").fingerprint).toStrictEqual({ name: "Bass", length: 8 });
  });
});
