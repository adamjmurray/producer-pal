// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abortableSleep } from "#webui/lib/utils/abortable-sleep";

describe("abortableSleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the delay when the signal never aborts", async () => {
    const controller = new AbortController();
    const pending = abortableSleep(1000, controller.signal);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBeUndefined();
  });

  it("resolves after the delay with no signal at all", async () => {
    const pending = abortableSleep(1000);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects a pending sleep when the signal aborts", async () => {
    const controller = new AbortController();
    const pending = abortableSleep(1000, controller.signal);

    controller.abort();

    await expect(pending).rejects.toThrow("Aborted");
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();

    controller.abort();

    await expect(abortableSleep(1000, controller.signal)).rejects.toThrow(
      "Aborted",
    );
  });

  it("uses the caller's rejection message", async () => {
    // executeWithRetry surfaces "Retry cancelled" into conversation history, so
    // the message is part of that caller's contract, not an internal detail.
    const controller = new AbortController();
    const pending = abortableSleep(1000, controller.signal, "Retry cancelled");

    controller.abort();

    await expect(pending).rejects.toThrow("Retry cancelled");
  });
});
