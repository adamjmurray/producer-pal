// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Widget } from "#src/shared/gen-ui-types.ts";
import { resetHubForTesting } from "../gen-ui-hub.ts";
import { connectWidgetsToSet } from "../set-storage.ts";
import {
  decodeWidgets,
  encodeWidgets,
  MAX_BLOB_CHARS,
} from "../widget-blob.ts";
import {
  createWidget,
  listWidgets,
  resetWidgetStoreForTesting,
} from "../widget-store.ts";

type Handler = (content: unknown) => void;

const sentToDevice = (): unknown[][] =>
  vi
    .mocked(Max.outlet)
    .mock.calls.filter(
      ([name, key]) => name === "config" && key === "genUiWidgets",
    )
    .map((call) => call.slice(2));

beforeEach(() => {
  resetHubForTesting();
  resetWidgetStoreForTesting();
  vi.mocked(Max.outlet).mockClear();
  connectWidgetsToSet();
});

afterEach(() => {
  resetWidgetStoreForTesting();
});

/** @returns The handler the device's saved list arrives through */
function fromDevice(): Handler {
  return (Max as unknown as { handlers: Map<string, Handler> }).handlers.get(
    "genUiWidgets",
  ) as Handler;
}

describe("widgets in the Live Set", () => {
  it("writes the list into the device's parameter after a change", () => {
    createWidget({ kind: "text", text: "a" });

    const [text] = sentToDevice()[0] ?? [];

    expect(decodeWidgets(String(text))).toStrictEqual([
      { id: "w1", kind: "text", text: "a" },
    ]);
  });

  it("loads what the device says the Set held", () => {
    fromDevice()(
      encodeWidgets([{ id: "w3", kind: "text", text: "from the Set" }]),
    );

    expect(listWidgets()).toStrictEqual([
      { id: "w3", kind: "text", text: "from the Set" },
    ]);
    expect(sentToDevice()).toStrictEqual([]);
  });

  it("reads an empty parameter, which Max reports as bang, as no widgets", () => {
    createWidget({ kind: "text", text: "a" });
    fromDevice()("bang");

    expect(listWidgets()).toStrictEqual([]);
  });

  it("doesn't fail a change when the device can't be written to", async () => {
    vi.mocked(Max.outlet).mockRejectedValueOnce(new Error("patch gone"));

    expect(createWidget({ kind: "text", text: "a" }).ok).toBe(true);
    await Promise.resolve();
    expect(listWidgets()).toHaveLength(1);
  });
});

const widgets: Widget[] = [
  { id: "w1", kind: "clip", ref: "t0/s0", title: 'Bass, "low"; ok' },
  { id: "w2", kind: "text", text: "multi\nline ünïcode ✓" },
];

describe("widget blob", () => {
  it("round-trips, awkward characters and all", () => {
    expect(decodeWidgets(encodeWidgets(widgets) as string)).toStrictEqual(
      widgets,
    );
  });

  it("is one plain word Max won't split or escape", () => {
    expect(encodeWidgets(widgets)).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("refuses a list too big for the Set", () => {
    const big: Widget[] = Array.from({ length: 10 }, (_, i) => ({
      id: `w${i}`,
      kind: "text",
      text: "x".repeat(4000),
    }));

    expect(encodeWidgets(big)).toBeNull();
    expect(MAX_BLOB_CHARS).toBeLessThan(32_767);
  });

  it("reads nothing saved as an empty list", () => {
    expect(decodeWidgets("")).toStrictEqual([]);
    expect(decodeWidgets("  ")).toStrictEqual([]);
  });

  it.each(["not base64 json!", "e30=", "WzFd"])(
    "reads %j as not a widget list",
    (text) => {
      expect(decodeWidgets(text)).toBeNull();
    },
  );
});
