// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useVoiceRetry,
  type UseVoiceRetryDeps,
} from "#webui/hooks/voice/use-voice-retry";

// The auto-retry delay floor is 1s and the cap is 5 consecutive attempts; pick a
// window comfortably past the floor so advancing by it always fires the timer.
const RATE_LIMIT_WINDOW_MS = 5000;
const PAST_WINDOW_MS = 6000;
const MAX_AUTO_RETRY_ATTEMPTS = 5;

interface Harness {
  deps: UseVoiceRetryDeps;
  sendEvent: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  setRateLimitedUntil: ReturnType<typeof vi.fn>;
}

/**
 * Build retry deps backed by a fake session whose transport records
 * response.create nudges, plus spies for the error/rate-limit setters.
 * @param overrides - Per-test overrides
 * @param overrides.hasSession - Set false to render with no connected session
 * @returns The deps object plus the spies the tests assert against
 */
function makeHarness(overrides: { hasSession?: boolean } = {}): Harness {
  const sendEvent = vi.fn();
  const setError = vi.fn();
  const setRateLimitedUntil = vi.fn();
  const session =
    overrides.hasSession === false ? null : { transport: { sendEvent } };

  const deps: UseVoiceRetryDeps = {
    sessionRef: {
      current: session as UseVoiceRetryDeps["sessionRef"]["current"],
    },
    rateLimitedUntil: null,
    setError,
    setRateLimitedUntil,
    attemptsRef: { current: 0 },
    activeResponseRef: { current: false },
  };

  return { deps, sendEvent, setError, setRateLimitedUntil };
}

/**
 * Render useVoiceRetry with a controllable rateLimitedUntil prop.
 * @param deps - The retry deps (rateLimitedUntil is overridden per render)
 * @returns The renderHook result/rerender handle
 */
function renderRetry(deps: UseVoiceRetryDeps) {
  return renderHook(
    ({ rateLimitedUntil }: { rateLimitedUntil: number | null }) =>
      useVoiceRetry({ ...deps, rateLimitedUntil }),
    { initialProps: { rateLimitedUntil: null as number | null } },
  );
}

describe("useVoiceRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("auto-retry timer", () => {
    it("fires a nudge once the window elapses and counts the attempt", async () => {
      const h = makeHarness();
      const { rerender } = renderRetry(h.deps);

      rerender({ rateLimitedUntil: Date.now() + RATE_LIMIT_WINDOW_MS });
      await act(async () => {
        vi.advanceTimersByTime(PAST_WINDOW_MS);
      });

      expect(h.sendEvent).toHaveBeenCalledWith({ type: "response.create" });
      expect(h.deps.attemptsRef.current).toBe(1);
      expect(h.setRateLimitedUntil).toHaveBeenCalledWith(null);
    });

    it("does not burn an attempt when a response is already active", async () => {
      const h = makeHarness();

      h.deps.activeResponseRef.current = true;
      const { rerender } = renderRetry(h.deps);

      rerender({ rateLimitedUntil: Date.now() + RATE_LIMIT_WINDOW_MS });
      await act(async () => {
        vi.advanceTimersByTime(PAST_WINDOW_MS);
      });

      // The nudge no-ops over an active response, so neither the event nor the
      // capped counter advances.
      expect(h.sendEvent).not.toHaveBeenCalled();
      expect(h.deps.attemptsRef.current).toBe(0);
    });

    it("cancels the pending timer when the rate limit clears", async () => {
      const h = makeHarness();
      const { rerender } = renderRetry(h.deps);

      rerender({ rateLimitedUntil: Date.now() + RATE_LIMIT_WINDOW_MS });
      // Clear the limit before the timer fires; the cleanup must cancel it.
      rerender({ rateLimitedUntil: null });
      await act(async () => {
        vi.advanceTimersByTime(PAST_WINDOW_MS);
      });

      expect(h.sendEvent).not.toHaveBeenCalled();
      expect(h.deps.attemptsRef.current).toBe(0);
    });
  });

  describe("cap and exhaustion flag", () => {
    it("does not arm a timer once the cap is hit and reports exhausted", async () => {
      const h = makeHarness();

      h.deps.attemptsRef.current = MAX_AUTO_RETRY_ATTEMPTS;
      const { result, rerender } = renderRetry(h.deps);

      expect(result.current.autoRetryExhausted).toBe(false);

      rerender({ rateLimitedUntil: Date.now() + RATE_LIMIT_WINDOW_MS });
      await act(async () => {
        vi.advanceTimersByTime(PAST_WINDOW_MS);
      });

      expect(h.sendEvent).not.toHaveBeenCalled();
      expect(result.current.autoRetryExhausted).toBe(true);
    });

    it("clears the exhausted flag when the rate limit clears", () => {
      const h = makeHarness();

      h.deps.attemptsRef.current = MAX_AUTO_RETRY_ATTEMPTS;
      const { result, rerender } = renderRetry(h.deps);

      rerender({ rateLimitedUntil: Date.now() + RATE_LIMIT_WINDOW_MS });
      expect(result.current.autoRetryExhausted).toBe(true);

      rerender({ rateLimitedUntil: null });
      expect(result.current.autoRetryExhausted).toBe(false);
    });
  });

  describe("manual retryResponse()", () => {
    it("returns true and sends a nudge when a session is connected", () => {
      const h = makeHarness();
      const { result } = renderRetry(h.deps);

      expect(result.current.retryResponse()).toBe(true);
      expect(h.sendEvent).toHaveBeenCalledWith({ type: "response.create" });
    });

    it("returns false without sending when there is no session", () => {
      const h = makeHarness({ hasSession: false });
      const { result } = renderRetry(h.deps);

      expect(result.current.retryResponse()).toBe(false);
      expect(h.sendEvent).not.toHaveBeenCalled();
    });

    it("surfaces an error and returns false when the nudge throws", () => {
      const h = makeHarness();

      h.sendEvent.mockImplementation(() => {
        throw new Error("transport closed");
      });
      const { result } = renderRetry(h.deps);

      expect(result.current.retryResponse()).toBe(false);
      expect(h.setError).toHaveBeenCalledWith("transport closed");
    });
  });
});
