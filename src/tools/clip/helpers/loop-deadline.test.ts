// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { CODE_EXEC_TIMEOUT_MS } from "#src/tools/clip/code-exec/code-exec-types.ts";
import { computeLoopDeadline, isDeadlineExceeded } from "./loop-deadline.ts";

describe("computeLoopDeadline", () => {
  it("should return null when timeoutMs is undefined", () => {
    expect(computeLoopDeadline(undefined)).toBeNull();
  });

  it("should return deadline offset by timeoutMs minus CODE_EXEC_TIMEOUT_MS", () => {
    const before = Date.now();
    const deadline = computeLoopDeadline(30_000);
    const after = Date.now();

    expect(deadline).toBeGreaterThanOrEqual(
      before + 30_000 - CODE_EXEC_TIMEOUT_MS,
    );
    expect(deadline).toBeLessThanOrEqual(after + 30_000 - CODE_EXEC_TIMEOUT_MS);
  });
});

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
