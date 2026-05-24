// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { extractResponseFailure } from "#webui/hooks/voice/use-voice-session-helpers";

const doneEvent = (response: unknown) => ({ type: "response.done", response });

describe("extractResponseFailure", () => {
  it("returns null for a completed response", () => {
    expect(
      extractResponseFailure(doneEvent({ status: "completed" })),
    ).toBeNull();
  });

  it("returns the error code and message for a failed response", () => {
    const failure = extractResponseFailure(
      doneEvent({
        status: "failed",
        status_details: { error: { code: "server_error", message: "boom" } },
      }),
    );

    expect(failure).toStrictEqual({ code: "server_error", message: "boom" });
  });

  it("falls back to 'unknown' when a failed response has no error code", () => {
    const failure = extractResponseFailure(
      doneEvent({ status: "failed", status_details: { error: {} } }),
    );

    expect(failure).toStrictEqual({
      code: "unknown",
      message: "Response failed",
    });
  });

  it("surfaces an incomplete response cut off by max_output_tokens", () => {
    const failure = extractResponseFailure(
      doneEvent({
        status: "incomplete",
        status_details: { reason: "max_output_tokens" },
      }),
    );

    expect(failure?.code).toBe("max_output_tokens");
    expect(failure?.message).toMatch(/maximum length/i);
  });

  it("surfaces an incomplete response stopped by the content filter", () => {
    const failure = extractResponseFailure(
      doneEvent({
        status: "incomplete",
        status_details: { reason: "content_filter" },
      }),
    );

    expect(failure?.code).toBe("content_filter");
    expect(failure?.message).toMatch(/content filter/i);
  });

  it("ignores a benign incomplete reason (interruption / barge-in)", () => {
    expect(
      extractResponseFailure(
        doneEvent({
          status: "incomplete",
          status_details: { reason: "turn_detected" },
        }),
      ),
    ).toBeNull();
  });

  it("ignores an incomplete response with no reason", () => {
    expect(
      extractResponseFailure(doneEvent({ status: "incomplete" })),
    ).toBeNull();
  });
});
