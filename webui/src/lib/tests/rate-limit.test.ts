// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  detectRateLimit,
  calculateRetryDelay,
  shouldRetry,
  MAX_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAYS,
} from "#webui/lib/rate-limit";

describe("detectRateLimit", () => {
  it("detects 429 status code in error object", () => {
    const error = { status: 429, message: "Too many requests" };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
  });

  it("detects statusCode property from AI SDK APICallError", () => {
    const error = { statusCode: 429, message: "Request failed" };
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

  it("treats numeric retryAfter as milliseconds (SDK property)", () => {
    // AI SDK / Anthropic SDK already convert the header to ms before exposing it
    const error = {
      status: 429,
      message: "Rate limited",
      retryAfter: 5000,
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(5000);
  });

  it("treats small numeric retryAfter as milliseconds, not seconds", () => {
    // No magnitude heuristic — SDK property is always ms
    const error = {
      status: 429,
      message: "Rate limited",
      retryAfter: 30,
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(30);
  });

  it("ignores non-numeric retryAfter on SDK property", () => {
    // Strings aren't a documented shape for the SDK property
    const error = {
      status: 429,
      message: "Rate limited",
      retryAfter: "30",
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

  it("extracts message from plain object with message property", () => {
    const error = { message: "rate limit exceeded" };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.message).toContain("Rate limit");
  });

  it("handles nested error without message property", () => {
    const error = {
      error: {
        code: 500,
        status: "INTERNAL_ERROR",
      },
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(false);
  });

  it("handles nested error with non-numeric code", () => {
    const error = {
      error: {
        code: "RATE_LIMITED",
        message: "rate limit hit",
      },
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
  });

  it("falls back to String() for non-object errors", () => {
    const error = 12345;
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(false);
  });

  it("extracts retryAfter from numeric HTTP header (seconds → ms)", () => {
    const error = {
      status: 429,
      message: "Rate limited",
      headers: {
        "retry-after": 60,
      },
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(60000);
  });

  it("extracts retryAfter from string HTTP header (seconds → ms)", () => {
    const error = {
      status: 429,
      message: "Rate limited",
      headers: {
        "retry-after": "30",
      },
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(30000);
  });

  it("returns null for an invalid HTTP retry-after header", () => {
    const error = {
      status: 429,
      message: "Rate limited",
      headers: {
        "retry-after": "next-tuesday",
      },
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(null);
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

    expect(delay).toBeGreaterThanOrEqual(60000);
    expect(delay).toBeLessThan(61000);
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
