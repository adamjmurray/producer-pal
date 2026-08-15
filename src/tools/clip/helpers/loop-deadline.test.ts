// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { CODE_EXEC_TIMEOUT_MS } from "#src/tools/clip/code-exec/code-exec-types.ts";
import { describe, expect, it, vi } from "vitest";
import {
  computeLoopDeadline,
  isDeadlineExceeded,
  LOOP_DEADLINE_BUFFER_MS,
  stopForDeadline,
} from "./loop-deadline.ts";

describe("LOOP_DEADLINE_BUFFER_MS", () => {
  it("is exactly twice the per-clip code execution timeout", () => {
    // Pin the multiplication: 2000 * 2 = 4000. A division mutant would yield
    // 1000, so assert both the derived relationship and the exact constant.
    expect(LOOP_DEADLINE_BUFFER_MS).toBe(CODE_EXEC_TIMEOUT_MS * 2);
    expect(LOOP_DEADLINE_BUFFER_MS).toBe(4000);
  });
});

describe("computeLoopDeadline", () => {
  it("should return null when timeoutMs is undefined", () => {
    expect(computeLoopDeadline(undefined)).toBeNull();
  });

  it("should return deadline offset by timeoutMs minus buffer", () => {
    const before = Date.now();
    const deadline = computeLoopDeadline(30_000);
    const after = Date.now();

    expect(deadline).toBeGreaterThanOrEqual(
      before + 30_000 - LOOP_DEADLINE_BUFFER_MS,
    );
    expect(deadline).toBeLessThanOrEqual(
      after + 30_000 - LOOP_DEADLINE_BUFFER_MS,
    );
  });

  it("should return an immediately-exceeded deadline for timeoutMs=0", () => {
    const deadline = computeLoopDeadline(0);

    expect(deadline).not.toBeNull();
    expect(isDeadlineExceeded(deadline!)).toBe(true);
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

describe("stopForDeadline", () => {
  it("warns with what is left undone once time is up", () => {
    expect(stopForDeadline(Date.now() - 1, () => "nope: 3|1")).toBe(true);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("nope: 3|1"),
    );
  });

  it("builds no warning while there is time left", () => {
    const describeRemaining = vi.fn(() => "unused");

    expect(stopForDeadline(Date.now() + 10_000, describeRemaining)).toBe(false);
    expect(describeRemaining).not.toHaveBeenCalled();
  });

  it("never stops a request that has no deadline", () => {
    expect(stopForDeadline(null, () => "unused")).toBe(false);
    expect(stopForDeadline(undefined, () => "unused")).toBe(false);
  });
});
