// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  AMXD_META_FROZEN,
  AMXD_META_UNFROZEN,
  buildAmxd,
  isFrozenAmxd,
  parseAmxd,
} from "./amxd-container.ts";

describe("buildAmxd", () => {
  it("writes the 32-byte header", () => {
    const bytes = buildAmxd(AMXD_META_FROZEN, Buffer.from("abc"));

    expect(bytes.subarray(0, 32).toString("hex")).toBe(
      "616d706604000000" + // ampf, 4
        "6d6d6d6d6d657461" + // mmmm meta
        "0400000007000000" + // 4, meta 7
        "707463680300" + // ptch, length 3 (little-endian)
        "0000",
    );
    expect(bytes.subarray(32).toString()).toBe("abc");
  });
});

describe("parseAmxd", () => {
  it("returns the meta value and body", () => {
    const body = Buffer.from("{}\0");

    expect(parseAmxd(buildAmxd(AMXD_META_UNFROZEN, body))).toStrictEqual({
      meta: AMXD_META_UNFROZEN,
      body,
    });
  });

  it("refuses a file that is not an .amxd", () => {
    expect(() => parseAmxd(Buffer.from("hello"))).toThrow(
      "Not a Max for Live device",
    );
    expect(() => parseAmxd(Buffer.alloc(40))).toThrow(
      "Not a Max for Live device",
    );
  });

  it("refuses a file whose length does not match its header", () => {
    const bytes = buildAmxd(AMXD_META_UNFROZEN, Buffer.from("abc"));

    expect(() => parseAmxd(bytes.subarray(0, bytes.length - 1))).toThrow(
      "truncated",
    );
  });
});

describe("isFrozenAmxd", () => {
  it("is true for a body that starts with mx@c", () => {
    const body = Buffer.concat([Buffer.from("mx@c"), Buffer.from("rest")]);

    expect(isFrozenAmxd(buildAmxd(AMXD_META_FROZEN, body))).toBe(true);
  });

  it("is false for an editable device with patcher JSON", () => {
    const body = Buffer.from('{"patcher":{}}');

    expect(isFrozenAmxd(buildAmxd(AMXD_META_UNFROZEN, body))).toBe(false);
  });

  it("is false for a file shorter than the header", () => {
    expect(isFrozenAmxd(Buffer.from("tiny"))).toBe(false);
  });
});
