// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import v8 from "node:v8";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitUntil } from "#src/shared/max/v8-wait-until.ts";

const g = globalThis as Record<string, unknown>;

// Mock the Task object for the Max for Live environment
class MockTask {
  private callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
  }

  schedule(_ms: number) {
    // Immediately resolve for testing
    setTimeout(this.callback, 0);
  }
}
g.Task = MockTask;

describe("v8-wait-until", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe("waitUntil", () => {
    it("returns true immediately when predicate is true on first check", async () => {
      const predicate = vi.fn().mockReturnValue(true);

      const result = await waitUntil(predicate);

      expect(result).toBe(true);
      expect(predicate).toHaveBeenCalledTimes(1);
    });

    it("returns true after predicate becomes true on subsequent check", async () => {
      let callCount = 0;
      const predicate = vi.fn().mockImplementation(() => {
        callCount++;

        return callCount >= 3;
      });

      const resultPromise = waitUntil(predicate, { pollingInterval: 10 });

      // Advance timers to allow async operations
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result).toBe(true);
      expect(predicate).toHaveBeenCalledTimes(3);
    });

    it("returns false when max retries exceeded", async () => {
      const predicate = vi.fn().mockReturnValue(false);

      const resultPromise = waitUntil(predicate, {
        pollingInterval: 10,
        maxRetries: 5,
      });

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result).toBe(false);
      expect(predicate).toHaveBeenCalledTimes(5);
    });

    it("uses default options when none provided", async () => {
      const predicate = vi.fn().mockReturnValue(true);

      const result = await waitUntil(predicate);

      expect(result).toBe(true);
    });

    it("sleeps via a scheduled Task between polls (not a busy loop)", async () => {
      // The private `sleep` must actually schedule a Task with the polling
      // interval; a no-op sleep would poll synchronously and never schedule.
      const scheduleSpy = vi.spyOn(MockTask.prototype, "schedule");
      let callCount = 0;
      const predicate = vi.fn().mockImplementation(() => {
        callCount++;

        return callCount >= 2;
      });

      const resultPromise = waitUntil(predicate, { pollingInterval: 25 });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(scheduleSpy).toHaveBeenCalledWith(25);
      scheduleSpy.mockRestore();
    });

    it("holds a scheduled Task so garbage collection can't drop it", async () => {
      // Max keeps no reference to a scheduled Task, so the test holds only
      // weak ones.
      vi.useRealTimers();
      v8.setFlagsFromString("--expose-gc");
      const gc = vm.runInNewContext("gc") as () => void;
      let taskRef: WeakRef<{ callback: () => void }> | undefined;

      g.Task = class {
        constructor(public callback: () => void) {
          taskRef = new WeakRef(this);
        }

        schedule(_ms: number): void {}
      };

      try {
        const result = waitUntil(vi.fn().mockReturnValueOnce(false), {
          maxRetries: 1,
        });

        // A WeakRef keeps its target alive until the current job ends.
        await new Promise((resolve) => setTimeout(resolve, 0));
        gc();

        expect(taskRef?.deref()).toBeDefined();
        taskRef?.deref()?.callback();
        await expect(result).resolves.toBe(false);
      } finally {
        g.Task = MockTask;
      }
    });
  });
});
