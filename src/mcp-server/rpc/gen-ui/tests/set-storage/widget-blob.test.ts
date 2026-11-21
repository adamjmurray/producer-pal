// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type Widget } from "#src/shared/gen-ui-types.ts";
import {
  decodeWidgets,
  encodeWidgets,
  MAX_BLOB_CHARS,
} from "../../widget-blob.ts";

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

  it("is plain JSON", () => {
    expect(JSON.parse(encodeWidgets(widgets) as string)).toStrictEqual({
      v: 1,
      widgets,
    });
  });

  it("refuses a list too big for the Set", () => {
    const big: Widget[] = Array.from({ length: 10 }, (_, i) => ({
      id: `w${i}`,
      kind: "text",
      text: "x".repeat(4000),
    }));

    expect(encodeWidgets(big)).toBeNull();
    expect(MAX_BLOB_CHARS).toBe(24_000);
  });

  it("reads nothing saved as an empty list", () => {
    expect(decodeWidgets("")).toStrictEqual([]);
    expect(decodeWidgets("  ")).toStrictEqual([]);
  });

  it.each(["not json!", "{}", "[1]", "null", '{"widgets":5}'])(
    "reads %j as not a widget list",
    (text) => {
      expect(decodeWidgets(text)).toBeNull();
    },
  );
});
