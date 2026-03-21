// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { RenderErrorFallback } from "./chat/assistant/message-list-helpers";
import { ErrorBoundary } from "./ErrorBoundary";

function ThrowingChild(): never {
  throw new Error("render crash");
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary fallback={<RenderErrorFallback />}>
        <div>child content</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("child content")).toBeDefined();
    expect(screen.queryByText("Failed to render")).toBeNull();
  });

  it("renders fallback when child throws during render", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<RenderErrorFallback />}>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Failed to render this message")).toBeDefined();
    spy.mockRestore();
  });

  it("logs the error to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<RenderErrorFallback />}>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(spy).toHaveBeenCalledWith(
      "ErrorBoundary caught render error:",
      expect.any(Error),
    );
    spy.mockRestore();
  });
});
