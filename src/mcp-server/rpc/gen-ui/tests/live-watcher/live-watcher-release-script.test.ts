// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A gen-UI build can run against a script installed from a release, which has
// none of the gen-UI routes and answers 404 to them. The watcher must fall back
// the way it does for an outdated script, and never throw.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type GenUiEvent } from "#src/shared/gen-ui-types.ts";
import { resetHubForTesting } from "../../gen-ui-hub.ts";
import { LiveWatcher, type WatcherDeps } from "../../live-watcher.ts";
import {
  createWidget,
  listWidgets,
  resetWidgetStoreForTesting,
  updateClipState,
} from "../../widget-store.ts";
import {
  clipInput,
  type FakeScript,
  resetForWatcherTest,
} from "../gen-ui-test-helpers.ts";

let script: FakeScript;

beforeEach(() => {
  script = resetForWatcherTest({ "t0/s0": { name: "Bass", length: 8 } });
  script.noGenUiRoutes = true;
});

afterEach(() => {
  resetHubForTesting();
  resetWidgetStoreForTesting();
  vi.useRealTimers();
});

describe("the live watcher against a script with no gen-UI routes", () => {
  it("falls back to refreshing after AI writes, and doesn't throw", async () => {
    const syncs: Array<{ mode: string; detail: string }> = [];
    const watcher = new LiveWatcher({
      request: script.request,
      listWidgets,
      updateClipState,
      publish: ((event: GenUiEvent) =>
        event) as unknown as WatcherDeps["publish"],
      setSync: (sync) => syncs.push(sync),
      now: () => 0,
    });

    createWidget(clipInput("t0/s0"));
    await expect(watcher.tick()).resolves.toBeUndefined();

    expect(syncs.at(-1)?.mode).toBe("writes-only");
    expect(listWidgets()[0]).not.toHaveProperty("gone", true);
    watcher.stop();
  });
});
