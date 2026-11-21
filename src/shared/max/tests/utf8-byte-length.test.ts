// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { utf8ByteLength } from "#src/shared/mcp-responses.ts";

describe("utf8ByteLength", () => {
  it.each([
    ["", 0],
    ["abc", 3],
    ["é", 2],
    ["あ", 3],
    ["😀", 4],
    ["a😀あé", 1 + 4 + 3 + 2],
    // A lone surrogate is encoded as U+FFFD, 3 bytes.
    ["\ud83d", 3],
    ["\ude00", 3],
    ["\ud83dx", 4],
  ])("measures %j as %i bytes", (text, bytes) => {
    expect(utf8ByteLength(text)).toBe(bytes);
  });

  it("agrees with TextEncoder", () => {
    const text = "Hello, 世界! 🎹🎶 ñ \ud83d lone";

    expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
  });
});
