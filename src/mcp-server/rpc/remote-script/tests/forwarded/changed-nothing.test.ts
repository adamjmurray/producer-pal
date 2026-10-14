// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  isChangedNothing,
  markChangedNothing,
} from "../../forwarded/changed-nothing.ts";

describe("changed-nothing", () => {
  it("is false until a response is marked", () => {
    expect(isChangedNothing({ content: [] })).toBe(false);
  });

  it("is true once marked, and stays out of the JSON and the spread", () => {
    const response = { content: [] };

    markChangedNothing(response);

    expect(isChangedNothing(response)).toBe(true);
    expect(JSON.stringify(response)).toBe('{"content":[]}');
    expect(Object.keys(response)).toStrictEqual(["content"]);
  });
});
