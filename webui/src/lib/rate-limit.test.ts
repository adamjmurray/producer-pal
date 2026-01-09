import { describe, it, expect } from "vitest";
import {
  detectRateLimit,
  calculateRetryDelay,
  shouldRetry,
  MAX_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAYS,
} from "./rate-limit";

describe("detectRateLimit", () => {
  it("detects 429 status code in error object", () => {
    const error = { status: 429, message: "Too many requests" };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
  });

  it("detects RESOURCE_EXHAUSTED in error message", () => {
    const error = new Error("Resource has been exhausted (e.g. check quota).");
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
  });

  it("detects rate limit in nested error object", () => {
    const error = {
      error: {
        code: 429,
        message: "Resource exhausted. Please try again later.",
        status: "RESOURCE_EXHAUSTED",
      },
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
  });

  it("detects quota exceeded message", () => {
    const error = new Error("You exceeded your current quota");
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
  });

  it("detects too many requests message", () => {
    const error = new Error("Too many requests, please slow down");
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
  });

  it("returns false for non-rate-limit errors", () => {
    const error = new Error("Network connection failed");
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(false);
  });

  it("returns false for generic API errors", () => {
    const error = { status: 500, message: "Internal server error" };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(false);
  });

  it("handles string errors", () => {
    const error = "429 Too Many Requests";
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
  });

  it("provides user-friendly message for quota errors", () => {
    const error = new Error("quota exceeded");
    const result = detectRateLimit(error);

    expect(result.message).toContain("quota exceeded");
    expect(result.message).toContain("retried automatically");
  });

  it("provides user-friendly message for rate limit errors", () => {
    const error = new Error("rate limit reached");
    const result = detectRateLimit(error);

    expect(result.message).toContain("Rate limit");
    expect(result.message).toContain("retried automatically");
  });

  it("extracts status code from error message text", () => {
    const error = new Error("Error 429: Too many requests");
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
  });

  it("extracts retryAfterMs from numeric retryAfter in milliseconds", () => {
    const error = {
      status: 429,
      message: "Rate limited",
      retryAfter: 5000, // Already in milliseconds (>= 1000)
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(5000);
  });

  it("extracts retryAfterMs from string retryAfter in seconds", () => {
    const error = {
      status: 429,
      message: "Rate limited",
      retryAfter: "30", // 30 seconds as string
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(30000);
  });

  it("converts retryAfter from seconds to milliseconds when < 1000", () => {
    const error = {
      status: 429,
      message: "Rate limited",
      retryAfter: 30, // 30 seconds (< 1000, so will be multiplied by 1000)
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(30000);
  });

  it("returns null retryAfterMs for invalid string retryAfter", () => {
    const error = {
      status: 429,
      message: "Rate limited",
      retryAfter: "invalid", // Not a valid number
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(null);
  });

  it("extracts status code from nested error.code property", () => {
    const error = {
      error: {
        code: 429,
        message: "Too many requests",
      },
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
  });
});

describe("calculateRetryDelay", () => {
  it("returns first delay for attempt 0", () => {
    const delay = calculateRetryDelay(0);

    expect(delay).toBeGreaterThanOrEqual(DEFAULT_RETRY_DELAYS[0]);
    expect(delay).toBeLessThan(DEFAULT_RETRY_DELAYS[0] + 1000);
  });

  it("returns increasing delays for subsequent attempts", () => {
    const delay0 = calculateRetryDelay(0);
    const delay1 = calculateRetryDelay(1);
    const delay2 = calculateRetryDelay(2);

    expect(delay1).toBeGreaterThan(delay0);
    expect(delay2).toBeGreaterThan(delay1);
  });

  it("uses server-provided retry-after when available", () => {
    const serverDelay = 5000;
    const delay = calculateRetryDelay(0, serverDelay);

    expect(delay).toBe(serverDelay);
  });

  it("caps server-provided retry-after at 60 seconds", () => {
    const serverDelay = 120000;
    const delay = calculateRetryDelay(0, serverDelay);

    expect(delay).toBe(60000);
  });

  it("uses exponential backoff when no retry-after provided", () => {
    const delay = calculateRetryDelay(3, null);

    expect(delay).toBeGreaterThanOrEqual(DEFAULT_RETRY_DELAYS[3]);
  });

  it("uses max delay for attempts beyond array length", () => {
    const delay = calculateRetryDelay(10);

    expect(delay).toBeGreaterThanOrEqual(32000);
    expect(delay).toBeLessThan(33000);
  });
});

describe("shouldRetry", () => {
  it("returns true for attempts below max", () => {
    expect(shouldRetry(0)).toBe(true);
    expect(shouldRetry(MAX_RETRY_ATTEMPTS - 1)).toBe(true);
  });

  it("returns false for max attempts", () => {
    expect(shouldRetry(MAX_RETRY_ATTEMPTS)).toBe(false);
  });

  it("returns false for attempts beyond max", () => {
    expect(shouldRetry(MAX_RETRY_ATTEMPTS + 1)).toBe(false);
  });
});
