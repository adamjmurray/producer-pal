import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitUntil } from "#src/shared/v8-sleep.ts";

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

describe("v8-sleep", () => {
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
  });
});
