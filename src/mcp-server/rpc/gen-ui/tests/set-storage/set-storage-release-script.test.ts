// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A gen-UI build can run against a script installed from a release, which has
// none of the gen-UI routes and answers 404 to them. Saving must degrade the
// way it does for an outdated script: widgets stay, one warning, a quiet retry.

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetHubForTesting } from "../../gen-ui-hub.ts";
import { RETRY_MS } from "../../set-storage.ts";
import {
  createWidget,
  listWidgets,
  resetWidgetStoreForTesting,
} from "../../widget-store.ts";
import { FakeScript } from "../gen-ui-test-helpers.ts";
import { connectToScript } from "./set-storage-test-helpers.ts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(Max.post).mockClear();
  resetHubForTesting();
  resetWidgetStoreForTesting();
});

afterEach(() => {
  resetWidgetStoreForTesting();
  vi.useRealTimers();
});

describe("saving widgets in the Set against a script with no gen-UI routes", () => {
  it("keeps the widgets, warns once and retries quietly", async () => {
    const script = new FakeScript();
    const storage = connectToScript(script);

    script.noGenUiRoutes = true;
    storage.start();
    createWidget({ kind: "text", text: "a" });
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);

    const warned = vi
      .mocked(Max.post)
      .mock.calls.filter(([, level]) => level === Max.POST_LEVELS.WARN);

    expect(listWidgets()).toHaveLength(1);
    expect(warned).toHaveLength(1);
    expect(warned[0]?.[0]).toContain("unknown route");
    expect(script.requests.length).toBeGreaterThan(2);
    storage.stop();
  });
});
