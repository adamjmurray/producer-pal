// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitRetry } from "#webui/components/voice/RateLimitRetry";

describe("RateLimitRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down and keeps the manual button disabled while waiting", () => {
    render(<RateLimitRetry until={Date.now() + 5000} onRetry={vi.fn()} />);

    expect(screen.getByText(/Auto-retrying in 5s…/)).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "Retry now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("switches to 'Retrying…' and enables the button when the window elapses", async () => {
    render(<RateLimitRetry until={Date.now() + 1000} onRetry={vi.fn()} />);

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByText("Retrying…")).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "Retry now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("shows the manual-retry copy and enables the button immediately when exhausted", () => {
    const onRetry = vi.fn();

    // Time still remaining, but auto-retry has given up: the copy must stop
    // promising an auto-retry and the button must be usable right away.
    render(
      <RateLimitRetry until={Date.now() + 5000} onRetry={onRetry} exhausted />,
    );

    expect(
      screen.getByText("Auto-retry limit reached — retry manually"),
    ).toBeDefined();

    const button = screen.getByRole("button", {
      name: "Retry now",
    }) as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
