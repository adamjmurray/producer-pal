// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { isDeadlineExceeded } from "../v8-request-deadline.ts";

describe("isDeadlineExceeded", () => {
  it("should return false for null deadline", () => {
    expect(isDeadlineExceeded(null)).toBe(false);
  });

  it("should return false when deadline is in the future", () => {
    expect(isDeadlineExceeded(Date.now() + 10_000)).toBe(false);
  });

  it("should return true when deadline is in the past", () => {
    expect(isDeadlineExceeded(Date.now() - 1)).toBe(true);
  });

  it("should return true when deadline equals current time", () => {
    vi.useFakeTimers({ now: 1000 });

    try {
      expect(isDeadlineExceeded(1000)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
