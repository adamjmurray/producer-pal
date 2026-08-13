// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeErrorMessage } from "#webui/lib/error-formatters";

describe("normalizeErrorMessage", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns Error message unchanged when it already starts with 'Error'", () => {
    expect(normalizeErrorMessage(new Error("boom"))).toBe("Error: boom");
  });

  it("prefixes 'Error: ' to string values that don't start with 'Error'", () => {
    expect(normalizeErrorMessage("network down")).toBe("Error: network down");
  });

  it("describes a provider error payload with its code and error type", () => {
    expect(
      normalizeErrorMessage({
        code: 429,
        message: "Provider returned error",
        metadata: { error_type: "rate_limit_exceeded" },
      }),
    ).toBe("Error: Provider returned error (429: rate_limit_exceeded)");
  });

  it("unwraps a payload nested under an 'error' key", () => {
    expect(
      normalizeErrorMessage({
        error: { message: "Insufficient credits", code: 402 },
      }),
    ).toBe("Error: Insufficient credits (402)");
  });

  it("reads a top-level 'type' when there is no metadata", () => {
    expect(
      normalizeErrorMessage({
        message: "Bad request",
        type: "invalid_request",
      }),
    ).toBe("Error: Bad request (invalid_request)");
  });

  it("uses a string 'error' field as the message", () => {
    expect(normalizeErrorMessage({ error: "upstream timeout" })).toBe(
      "Error: upstream timeout",
    );
  });

  it("falls back to JSON for payloads with no message", () => {
    expect(normalizeErrorMessage({ code: 42 })).toBe('Error: {"code":42}');
  });

  it("names the failure for payloads JSON cannot serialize", () => {
    const circular: Record<string, unknown> = { code: 500 };

    circular.self = circular;

    expect(normalizeErrorMessage(circular)).toBe(
      "Error: [unserializable error payload]",
    );
  });

  it("prefixes 'Error: ' to other non-string values", () => {
    expect(normalizeErrorMessage(42)).toBe("Error: 42");
  });
});
