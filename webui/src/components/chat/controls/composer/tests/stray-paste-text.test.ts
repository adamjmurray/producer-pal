// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { isStrayPasteText } from "#webui/components/chat/controls/composer/stray-paste-text";

const files = [
  new File(["x"], "a.png", { type: "image/png" }),
  new File(["y"], "b photo.jpg", { type: "image/jpeg" }),
];

describe("isStrayPasteText", () => {
  it("accepts the pasted files' own names, one per line", () => {
    expect(isStrayPasteText("a.png\r\nb photo.jpg\n", files, false)).toBe(true);
  });

  it("accepts a lone link when the HTML holds no text", () => {
    expect(isStrayPasteText("https://example.com/x.png", files, false)).toBe(
      true,
    );
  });

  it("keeps a link when the HTML holds real text", () => {
    expect(isStrayPasteText("https://example.com/x.png", files, true)).toBe(
      false,
    );
  });

  it("still drops file names when the HTML holds text", () => {
    expect(isStrayPasteText("a.png", files, true)).toBe(true);
  });

  it("keeps text that is anything else", () => {
    expect(isStrayPasteText("look at a.png", files, false)).toBe(false);
    expect(isStrayPasteText("a.png\nand this", files, false)).toBe(false);
    expect(isStrayPasteText("other.png", files, false)).toBe(false);
  });

  it("keeps blank text", () => {
    expect(isStrayPasteText(" \n", files, false)).toBe(false);
  });
});
