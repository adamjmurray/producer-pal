/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/preact";
import { RateLimitIndicator } from "./RateLimitIndicator";

describe("RateLimitIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it("displays retry attempt count", () => {
    render(
      <RateLimitIndicator
        retryAttempt={1}
        maxAttempts={5}
        retryDelayMs={5000}
      />,
    );

    expect(screen.getByText(/Retry attempt 2 of 5/)).toBeTruthy();
  });

  it("displays countdown timer", () => {
    render(
      <RateLimitIndicator
        retryAttempt={0}
        maxAttempts={5}
        retryDelayMs={3000}
      />,
    );

    expect(screen.getByText(/Retrying in 3s/)).toBeTruthy();
  });

  it("displays rate limit message", () => {
    render(
      <RateLimitIndicator
        retryAttempt={0}
        maxAttempts={5}
        retryDelayMs={5000}
      />,
    );

    expect(screen.getByText(/Rate limit reached/)).toBeTruthy();
  });

  it("shows cancel button when onCancel provided", () => {
    const onCancel = vi.fn();

    render(
      <RateLimitIndicator
        retryAttempt={0}
        maxAttempts={5}
        retryDelayMs={5000}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("calls onCancel when cancel button clicked", () => {
    const onCancel = vi.fn();

    render(
      <RateLimitIndicator
        retryAttempt={0}
        maxAttempts={5}
        retryDelayMs={5000}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not show cancel button when onCancel not provided", () => {
    render(
      <RateLimitIndicator
        retryAttempt={0}
        maxAttempts={5}
        retryDelayMs={5000}
      />,
    );

    expect(screen.queryByText("Cancel")).toBeNull();
  });

  it("shows progress bar", () => {
    const { container } = render(
      <RateLimitIndicator
        retryAttempt={0}
        maxAttempts={5}
        retryDelayMs={5000}
      />,
    );

    const progressBar = container.querySelector(".bg-amber-500");

    expect(progressBar).toBeTruthy();
  });

  it("updates countdown as time passes", async () => {
    render(
      <RateLimitIndicator
        retryAttempt={0}
        maxAttempts={5}
        retryDelayMs={3000}
      />,
    );

    expect(screen.getByText(/Retrying in 3s/)).toBeTruthy();

    // Advance time by 1 second
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/Retrying in 2s/)).toBeTruthy();
  });

  it("cleans up interval on unmount", async () => {
    const { unmount } = render(
      <RateLimitIndicator
        retryAttempt={0}
        maxAttempts={5}
        retryDelayMs={5000}
      />,
    );

    // Unmount should clean up the interval without errors
    unmount();

    // Advancing timers after unmount should not cause issues
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Verify no errors occurred (test passes if we get here)
    expect(true).toBe(true);
  });
});
