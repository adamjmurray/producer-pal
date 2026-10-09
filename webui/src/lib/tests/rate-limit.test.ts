// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { APICallError } from "ai";
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
    const error = new Error("Quota exceeded for metric: requests per minute");
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
  });

  it("does not retry OpenAI's out-of-credit 429 (insufficient_quota)", () => {
    // Body from OpenAI's 429 insufficient_quota response, as the AI SDK
    // surfaces it: message text only, body kept in `data`.
    const data = {
      error: {
        message:
          "You exceeded your current quota, please check your plan and billing details.",
        type: "insufficient_quota",
        param: null,
        code: "insufficient_quota",
      },
    };
    const error = new APICallError({
      message: data.error.message,
      url: "https://api.openai.com/v1/responses",
      requestBodyValues: {},
      statusCode: 429,
      responseBody: JSON.stringify(data),
      data,
    });

    expect(detectRateLimit(error).isRateLimited).toBe(false);
    expect(detectRateLimit(data).isRateLimited).toBe(false);
    expect(
      detectRateLimit({ status: 429, code: "insufficient_quota" })
        .isRateLimited,
    ).toBe(false);
  });

  it.each([
    // Responses API error event, before any output
    {
      type: "error",
      code: "insufficient_quota",
      message:
        "You exceeded your current quota, please check your plan and billing details.",
      param: null,
    },
    {
      type: "response.failed",
      response: {
        error: {
          code: "insufficient_quota",
          message:
            "You exceeded your current quota, please check your plan and billing details.",
        },
      },
    },
  ])("does not retry OpenAI's out-of-credit stream frame: $type", (frame) => {
    // Shape built by @ai-sdk/openai's createOpenAIStreamError
    const error = new APICallError({
      message:
        "You exceeded your current quota, please check your plan and billing details.",
      url: "https://api.openai.com/v1/responses",
      requestBodyValues: {},
      statusCode: 429,
      responseBody: JSON.stringify(frame),
      data: frame,
    });

    expect(detectRateLimit(error).isRateLimited).toBe(false);
  });

  it.each([
    "Error code: insufficient_quota",
    new Error("429 insufficient_quota: no credits left"),
  ])("does not retry when insufficient_quota is only in the text: %s", (e) => {
    expect(detectRateLimit(e).isRateLimited).toBe(false);
  });

  // Gemini's per-minute and per-day 429s share this text with OpenAI's
  // out-of-credit one. Only the quotaId differs, and both carry a RetryInfo.
  it.each([
    "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
    "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
  ])("retries Gemini's 429 RESOURCE_EXHAUSTED quota error (%s)", (quotaId) => {
    const data = {
      error: {
        code: 429,
        message:
          "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.",
        status: "RESOURCE_EXHAUSTED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [{ quotaId }],
          },
          {
            "@type": "type.googleapis.com/google.rpc.RetryInfo",
            retryDelay: "34s",
          },
        ],
      },
    };
    const error = new APICallError({
      message: data.error.message,
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent",
      requestBodyValues: {},
      statusCode: 429,
      responseBody: JSON.stringify(data),
      data,
    });
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.message).toContain("retried automatically");
    expect(detectRateLimit(data).isRateLimited).toBe(true);
  });

  it.each([
    "Failed to generate content: request exceeds the context limit",
    "Unknown tool toolu_01A4293x",
    "Invalid request at line 429",
    "Error: prompt is too long: requested 429 tokens",
  ])("does not treat unrelated text as a rate limit: %s", (message) => {
    expect(detectRateLimit(new Error(message)).isRateLimited).toBe(false);
  });

  it.each(["rate limit reached", "rate-limit hit", "rate_limit_exceeded"])(
    "detects rate limit wording: %s",
    (message) => {
      expect(detectRateLimit(new Error(message)).isRateLimited).toBe(true);
    },
  );

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

  it.each([
    "API error (429): overloaded",
    "HTTP/1.1 429 Too Early",
    "status=429",
    "statusCode: 429",
    "status_code=429",
    '{"code":429}',
    "Error code: 429 - {}",
  ])("reads a status from message text: %s", (message) => {
    expect(detectRateLimit(new Error(message)).isRateLimited).toBe(true);
  });

  it("does not throw on a circular error object", () => {
    const error: Record<string, unknown> = { status: 429 };

    error.self = error;

    expect(detectRateLimit(error).isRateLimited).toBe(true);
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

  it("extracts retryAfter from the AI SDK's responseHeaders", () => {
    const error = {
      statusCode: 429,
      message: "Rate limited",
      responseHeaders: {
        "retry-after": "15",
      },
    };
    const result = detectRateLimit(error);

    expect(result.isRateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(15000);
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
