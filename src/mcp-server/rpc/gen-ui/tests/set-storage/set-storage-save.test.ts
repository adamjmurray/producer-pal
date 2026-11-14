// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetHubForTesting } from "../../gen-ui-hub.ts";
import { RETRY_MS, SAVE_DELAY_MS, SetStorage } from "../../set-storage.ts";
import {
  createWidget,
  listWidgets,
  resetWidgetStoreForTesting,
  updateWidget,
} from "../../widget-store.ts";
import { FakeScript } from "../gen-ui-test-helpers.ts";
import {
  connectToScript,
  warnings,
  widgetsIn,
} from "./set-storage-test-helpers.ts";

let script: FakeScript;
let storage: SetStorage;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.mocked(Max.post).mockClear();
  resetHubForTesting();
  resetWidgetStoreForTesting();
  script = new FakeScript();
  storage = connectToScript(script);
  storage.start();
  await vi.advanceTimersByTimeAsync(0);
  script.requests = [];
});

afterEach(() => {
  storage.stop();
  resetWidgetStoreForTesting();
  vi.useRealTimers();
});

describe("saving the Set's widgets", () => {
  it("saves the list after a change", async () => {
    createWidget({ kind: "text", text: "a" });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

    expect(script.saves.map((text) => widgetsIn(text))).toStrictEqual([
      [{ id: "w1", kind: "text", text: "a" }],
    ]);
  });

  it("saves only the latest list when changes come close together", async () => {
    createWidget({ kind: "text", text: "a" });
    createWidget({ kind: "text", text: "b" });
    updateWidget("w1", { title: "First" });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

    expect(script.saves).toHaveLength(1);
    expect(widgetsIn(script.saves[0])).toStrictEqual(listWidgets());
  });

  it("saves a change made while a save is on its way, after it", async () => {
    createWidget({ kind: "text", text: "a" });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    createWidget({ kind: "text", text: "b" });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

    expect(script.saves.map((text) => widgetsIn(text).length)).toStrictEqual([
      1, 2,
    ]);
  });

  it("sends nothing when nothing changed", async () => {
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);

    expect(script.requests).toStrictEqual([]);
  });
});

describe("a save that fails", () => {
  it("doesn't fail the change, and is retried with the latest list", async () => {
    script.saveStatus = 500;

    expect(createWidget({ kind: "text", text: "a" }).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

    expect(listWidgets()).toHaveLength(1);
    expect(script.saves).toStrictEqual([]);

    createWidget({ kind: "text", text: "b" });
    script.saveStatus = 200;
    await vi.advanceTimersByTimeAsync(RETRY_MS);

    expect(script.saves).toHaveLength(1);
    expect(widgetsIn(script.saves[0])).toHaveLength(2);
  });

  it("is retried when the script goes quiet, and warns once", async () => {
    script.down = {};
    createWidget({ kind: "text", text: "a" });
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);

    expect(warnings()).toHaveLength(1);
    expect(script.saves).toStrictEqual([]);

    script.down = false;
    await vi.advanceTimersByTimeAsync(RETRY_MS);

    expect(widgetsIn(script.saves.at(-1))).toHaveLength(1);
  });

  it("is retried after a timeout", async () => {
    createWidget({ kind: "text", text: "a" });
    script.failNext = new Error("took too long");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + RETRY_MS);

    expect(widgetsIn(script.saves.at(-1))).toHaveLength(1);
    expect(warnings().join()).toContain("took too long");
  });

  it("warns again for a new failure after a good save", async () => {
    script.saveStatus = 500;
    createWidget({ kind: "text", text: "a" });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    script.saveStatus = 200;
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    script.saveStatus = 500;
    createWidget({ kind: "text", text: "b" });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

    expect(warnings()).toHaveLength(2);
  });

  it("stops retrying once stopped", async () => {
    script.saveStatus = 500;
    createWidget({ kind: "text", text: "a" });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    storage.stop();
    script.requests = [];
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);

    expect(script.requests).toStrictEqual([]);
  });
});

describe("rounds that overlap", () => {
  it("runs one round at a time", async () => {
    createWidget({ kind: "text", text: "a" });
    await Promise.all([storage.sync(), storage.sync()]);

    expect(script.saves).toHaveLength(1);
  });

  it("saves a change that lands mid-save in a round of its own", async () => {
    storage.stop();

    const request = script.request;
    let changed = false;

    script.request = (r) => {
      if (r.route === "/ui-widgets/save" && !changed) {
        changed = true;
        createWidget({ kind: "text", text: "b" });
      }

      return request(r);
    };

    storage = connectToScript(script);
    storage.start();
    await vi.advanceTimersByTimeAsync(0);
    createWidget({ kind: "text", text: "a" });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);

    expect(script.saves.map((text) => widgetsIn(text).length)).toStrictEqual([
      1, 2,
    ]);
  });

  it("saves nothing when early changes leave no list to save", async () => {
    storage.stop();
    storage = new SetStorage({
      request: script.request,
      load: vi.fn(),
      currentText: () => null,
    });
    storage.save("early");
    await storage.sync();

    expect(script.saves).toStrictEqual([]);
  });
});
