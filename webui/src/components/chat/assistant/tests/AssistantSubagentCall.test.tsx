// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetSubagentRateLimits,
  setSubagentRateLimit,
} from "#webui/chat/sdk/subagent-rate-limit";
import { AssistantSubagentCall } from "#webui/components/chat/assistant/tool-calls/AssistantSubagentCall";

describe("AssistantSubagentCall", () => {
  afterEach(() => {
    resetSubagentRateLimits();
  });

  it("shows a working state while the subagent runs (result null)", () => {
    render(<AssistantSubagentCall task="write a bassline" result={null} />);

    expect(screen.getByText("working…")).toBeDefined();
    expect(screen.getByText(/Working on write a bassline/)).toBeDefined();
  });

  it("pulses only while the assistant is still responding", () => {
    const { container } = render(
      <AssistantSubagentCall task="x" result={null} isResponding />,
    );

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("renders the return value when done", () => {
    render(
      <AssistantSubagentCall
        task="write a bassline"
        result={JSON.stringify("Added a bassline in the Bass track.")}
      />,
    );

    expect(screen.getByText("done")).toBeDefined();
    expect(
      screen.getByText("Added a bassline in the Bass track."),
    ).toBeDefined();
  });

  it("shows a failed status and red border on error", () => {
    const { container } = render(
      <AssistantSubagentCall task="x" result={"boom"} isError />,
    );

    expect(screen.getByText("failed")).toBeDefined();
    expect(container.querySelector(".border-red-500")).not.toBeNull();
  });

  it("renders the transcript in a nested disclosure when provided", () => {
    render(
      <AssistantSubagentCall
        task="x"
        result={JSON.stringify("done")}
        transcript={<div>worker said hi</div>}
      />,
    );

    expect(screen.getByText("↳ subagent transcript")).toBeDefined();
    expect(screen.getByText("worker said hi")).toBeDefined();
  });

  it("omits the transcript disclosure when there is none", () => {
    render(<AssistantSubagentCall task="x" result={JSON.stringify("done")} />);

    expect(screen.queryByText("↳ subagent transcript")).toBeNull();
  });

  it("shows the backoff countdown while the worker is rate-limited", async () => {
    // The card is otherwise frozen on "working…" for the whole backoff, which
    // can run minutes — indistinguishable from a hung subagent.
    render(<AssistantSubagentCall task="x" result={null} toolCallId="tc1" />);

    await act(() =>
      setSubagentRateLimit("tc1", {
        attempt: 1,
        maxAttempts: 5,
        retryAtMs: Date.now() + 20_000,
      }),
    );

    expect(screen.getByText("rate limited")).toBeDefined();
    expect(
      screen.getByText(/retrying in 2\ds \(attempt 2 of 5\)/),
    ).toBeDefined();
  });

  it("drops back to working when the backoff clears", async () => {
    render(<AssistantSubagentCall task="x" result={null} toolCallId="tc1" />);

    await act(() =>
      setSubagentRateLimit("tc1", {
        attempt: 0,
        maxAttempts: 5,
        retryAtMs: Date.now() + 5000,
      }),
    );
    await act(() => setSubagentRateLimit("tc1", null));

    expect(screen.getByText("working…")).toBeDefined();
    expect(screen.queryByText(/Rate limited/)).toBeNull();
  });

  it("ignores a stale backoff once the call has a result", () => {
    setSubagentRateLimit("tc1", {
      attempt: 0,
      maxAttempts: 5,
      retryAtMs: Date.now() + 5000,
    });

    render(
      <AssistantSubagentCall
        task="x"
        result={JSON.stringify("Bassline added.")}
        toolCallId="tc1"
      />,
    );

    expect(screen.getByText("done")).toBeDefined();
    expect(screen.queryByText(/Rate limited/)).toBeNull();
  });

  it("distinguishes waiting on a sibling's backoff from its own rate limit", async () => {
    // attempt null = this worker was never rate-limited, it's only holding the
    // shared gate. Calling that "rate limited" would misreport it.
    render(<AssistantSubagentCall task="x" result={null} toolCallId="tc1" />);

    await act(() =>
      setSubagentRateLimit("tc1", {
        attempt: null,
        maxAttempts: 5,
        retryAtMs: Date.now() + 20_000,
      }),
    );

    expect(screen.getByText("waiting")).toBeDefined();
    expect(screen.getByText(/Another subagent hit a rate limit/)).toBeDefined();
    expect(screen.queryByText("rate limited")).toBeNull();
  });

  it("counts the backoff down while it elapses", async () => {
    vi.useFakeTimers();

    try {
      render(<AssistantSubagentCall task="x" result={null} toolCallId="tc1" />);

      await act(() =>
        setSubagentRateLimit("tc1", {
          attempt: 0,
          maxAttempts: 5,
          retryAtMs: Date.now() + 10_000,
        }),
      );
      expect(screen.getByText(/retrying in 10s/)).toBeDefined();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.getByText(/retrying in 7s/)).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("picks up a backoff that was already in flight before it mounted", () => {
    setSubagentRateLimit("tc1", {
      attempt: 0,
      maxAttempts: 5,
      retryAtMs: Date.now() + 5000,
    });

    render(<AssistantSubagentCall task="x" result={null} toolCallId="tc1" />);

    expect(screen.getByText("rate limited")).toBeDefined();
  });

  it("ignores a sibling worker's backoff", () => {
    setSubagentRateLimit("tc2", {
      attempt: 0,
      maxAttempts: 5,
      retryAtMs: Date.now() + 5000,
    });

    render(<AssistantSubagentCall task="x" result={null} toolCallId="tc1" />);

    expect(screen.getByText("working…")).toBeDefined();
  });

  it("drops the backoff when the call finishes mid-wait", async () => {
    // The result arriving unsubscribes the card; a status left in the store
    // (e.g. a sibling's) must not keep showing a countdown on a done card.
    const { rerender } = render(
      <AssistantSubagentCall task="x" result={null} toolCallId="tc1" />,
    );

    await act(() =>
      setSubagentRateLimit("tc1", {
        attempt: 0,
        maxAttempts: 5,
        retryAtMs: Date.now() + 5000,
      }),
    );
    expect(screen.getByText("rate limited")).toBeDefined();

    rerender(
      <AssistantSubagentCall
        task="x"
        result={JSON.stringify("Bassline added.")}
        toolCallId="tc1"
      />,
    );

    expect(screen.getByText("done")).toBeDefined();
    expect(screen.queryByText(/Rate limited/)).toBeNull();
  });

  it("stops listening once unmounted", async () => {
    const { unmount } = render(
      <AssistantSubagentCall task="x" result={null} toolCallId="tc1" />,
    );

    unmount();
    await act(() =>
      setSubagentRateLimit("tc1", {
        attempt: 0,
        maxAttempts: 5,
        retryAtMs: Date.now() + 5000,
      }),
    );

    expect(screen.queryByText("rate limited")).toBeNull();
  });
});
