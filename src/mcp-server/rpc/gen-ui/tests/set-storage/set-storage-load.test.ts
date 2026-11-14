// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetHubForTesting } from "../../gen-ui-hub.ts";
import { RETRY_MS, SAVE_DELAY_MS, type SetStorage } from "../../set-storage.ts";
import {
  createWidget,
  listWidgets,
  removeWidget,
  resetWidgetStoreForTesting,
} from "../../widget-store.ts";
import { FakeScript } from "../gen-ui-test-helpers.ts";
import {
  connectToScript,
  expectLoadedBeforeFirstSave,
  loadAfterEarlyChange,
  textOf,
  warnings,
  widgetsIn,
} from "./set-storage-test-helpers.ts";

let script: FakeScript;
let storage: SetStorage;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(Max.post).mockClear();
  resetHubForTesting();
  resetWidgetStoreForTesting();
  script = new FakeScript();
  storage = connectToScript(script);
});

afterEach(() => {
  storage.stop();
  resetWidgetStoreForTesting();
  vi.useRealTimers();
});

const note = { id: "w3", kind: "text", text: "from the Set" } as const;

describe("loading the Set's widgets", () => {
  it("shows the list the Set holds, and doesn't save it back", async () => {
    script.widgetText = textOf([note]);
    storage.start();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

    expect(listWidgets()).toStrictEqual([note]);
    expect(script.saves).toStrictEqual([]);
  });

  it("starts empty and saves nothing for a Set with no list", async () => {
    storage.start();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

    expect(listWidgets()).toStrictEqual([]);
    expect(script.requests.map((r) => r.route)).toStrictEqual(["/ui-widgets"]);
  });

  it("saves nothing before the list is loaded, however long the script is silent", async () => {
    script.widgetText = textOf([note]);
    script.down = {};
    storage.start();
    createWidget({ kind: "text", text: "early" });
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);

    expect(script.routes("/ui-widgets/save")).toHaveLength(0);
    expect(script.saves).toStrictEqual([]);
  });

  it("then loads first, and saves the Set's widgets with the early ones after them", async () => {
    script.widgetText = textOf([note]);
    await loadAfterEarlyChange(script, storage, () =>
      createWidget({ kind: "text", text: "early" }),
    );

    expectLoadedBeforeFirstSave(script);
    expect(listWidgets().map((w) => w.id)).toStrictEqual(["w3", "w4"]);
    expect(script.saves).toHaveLength(1);
    expect(widgetsIn(script.saves[0])).toStrictEqual(listWidgets());
  });

  it("saves an early widget on a Set that has no list, and nothing else", async () => {
    await loadAfterEarlyChange(script, storage, () =>
      createWidget({ kind: "text", text: "early" }),
    );

    expectLoadedBeforeFirstSave(script);
    expect(script.saves.map((text) => widgetsIn(text))).toStrictEqual([
      [{ id: "w1", kind: "text", text: "early" }],
    ]);
  });

  it("never wipes the Set's list, even when the early changes cancel out", async () => {
    script.widgetText = textOf([note]);
    await loadAfterEarlyChange(script, storage, () => {
      createWidget({ kind: "text", text: "early" });
      removeWidget("w1");
    });

    expect(listWidgets()).toStrictEqual([note]);

    for (const text of script.saves) {
      expect(widgetsIn(text)).toStrictEqual([note]);
    }
  });

  it("merges changes made while the load is on its way", async () => {
    script.widgetText = textOf([note]);
    storage.start();
    await vi.advanceTimersByTimeAsync(0);
    createWidget({ kind: "text", text: "during" });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);

    expect(listWidgets().map((w) => w.id)).toStrictEqual(["w3", "w4"]);
    expect(widgetsIn(script.saves.at(-1))).toStrictEqual(listWidgets());
  });

  it("keeps trying to load while the script is down, then loads", async () => {
    script.widgetText = textOf([note]);
    script.down = {};
    storage.start();
    await vi.advanceTimersByTimeAsync(RETRY_MS * 2);

    expect(listWidgets()).toStrictEqual([]);

    script.down = false;
    await vi.advanceTimersByTimeAsync(RETRY_MS);

    expect(listWidgets()).toStrictEqual([note]);
  });

  it("retries a load that timed out", async () => {
    script.widgetText = textOf([note]);
    script.failNext = new Error("took too long");
    storage.start();
    await vi.advanceTimersByTimeAsync(RETRY_MS);

    expect(listWidgets()).toStrictEqual([note]);
    expect(warnings().join()).toContain("took too long");
  });
});

describe("a remote script that can't keep the list", () => {
  const old = "the remote script is out of date";

  it("keeps widgets for the session, warns once and retries quietly", async () => {
    script.down = { outdated: old };
    storage.start();
    createWidget({ kind: "text", text: "a" });
    await vi.advanceTimersByTimeAsync(RETRY_MS * 4);

    expect(listWidgets()).toHaveLength(1);
    expect(script.saves).toStrictEqual([]);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain(old);
    expect(script.requests.length).toBeGreaterThan(3);
  });

  it("starts saving once the script is good", async () => {
    script.down = { outdated: old };
    storage.start();
    createWidget({ kind: "text", text: "a" });
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    script.down = false;
    await vi.advanceTimersByTimeAsync(RETRY_MS + SAVE_DELAY_MS);

    expect(script.saves.map((text) => widgetsIn(text))).toStrictEqual([
      [{ id: "w1", kind: "text", text: "a" }],
    ]);
  });
});
