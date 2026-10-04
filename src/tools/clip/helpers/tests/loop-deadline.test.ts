// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { CODE_EXEC_TIMEOUT_MS } from "#src/tools/clip/code-exec/code-exec-types.ts";
import { describe, expect, it } from "vitest";
import { isDeadlineExceeded } from "#src/shared/max/v8-request-deadline.ts";
import {
  computeLoopDeadline,
  LOOP_DEADLINE_BUFFER_MS,
} from "../loop-deadline.ts";

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

  // The Timeout setting bottoms out at 1 second. Subtracting a flat 4s buffer
  // put the deadline in the past, so every loop stopped before its first
  // iteration and the whole call did nothing.
  it.each([1000, 2000, 4000])(
    "leaves time to work at a %ims timeout",
    (timeoutMs) => {
      const deadline = computeLoopDeadline(timeoutMs);

      expect(isDeadlineExceeded(deadline)).toBe(false);
    },
  );

  it("gives a short timeout half its budget", () => {
    const before = Date.now();
    const deadline = computeLoopDeadline(1000);
    const after = Date.now();

    expect(deadline).toBeGreaterThanOrEqual(before + 500);
    expect(deadline).toBeLessThanOrEqual(after + 500);
  });
});
