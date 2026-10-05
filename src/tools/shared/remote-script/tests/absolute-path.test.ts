// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { isAbsolutePath } from "../absolute-path.ts";

describe("isAbsolutePath", () => {
  it.each([
    "/Users/me/kick.wav",
    "C:\\Users\\me\\kick.wav",
    "c:/Users/me/kick.wav",
    "\\\\nas\\music\\kick.wav",
  ])("accepts %s", (path) => {
    expect(isAbsolutePath(path)).toBe(true);
  });

  it.each(["kick.wav", "samples/kick.wav", "C:kick.wav", "\\kick.wav", ""])(
    "rejects %j",
    (path) => {
      expect(isAbsolutePath(path)).toBe(false);
    },
  );
});
