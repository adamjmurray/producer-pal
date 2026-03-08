// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { DemoMode } from "./DemoMode";

describe("DemoMode", () => {
  it("renders the message list", () => {
    render(<DemoMode />);
    expect(screen.getByTestId("message-list")).toBeDefined();
  });

  it("shows demo mode header", () => {
    render(<DemoMode />);
    expect(screen.getByText(/Demo Mode/)).toBeDefined();
  });

  it("shows exit demo link", () => {
    render(<DemoMode />);
    const link = screen.getByText("Exit Demo");

    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("?");
  });

  it("renders tool call summaries", () => {
    render(<DemoMode />);
    // Success tool calls
    expect(screen.getAllByText(/used tool:/).length).toBeGreaterThan(0);
    // Error tool calls
    expect(screen.getAllByText(/tool failed:/).length).toBeGreaterThan(0);
    // Pending tool call
    expect(screen.getAllByText(/using tool:/).length).toBeGreaterThan(0);
  });

  it("renders error styling for failed tools", () => {
    render(<DemoMode />);
    const errorBorders = document.querySelectorAll(".border-red-500");

    expect(errorBorders.length).toBeGreaterThan(0);
  });

  it("renders connection error part", () => {
    render(<DemoMode />);
    expect(screen.getByText("Error")).toBeDefined();
  });

  it("renders assistant message bubbles", () => {
    render(<DemoMode />);
    const bubbles = screen.getAllByTestId("assistant-message-bubble");

    expect(bubbles.length).toBeGreaterThan(0);
  });
});
