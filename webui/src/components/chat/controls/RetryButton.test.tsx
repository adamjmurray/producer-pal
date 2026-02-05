// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { RetryButton } from "./RetryButton";

describe("RetryButton", () => {
  it("renders the retry button", () => {
    const mockOnClick = vi.fn();

    render(<RetryButton onClick={mockOnClick} />);

    const button = screen.getByRole("button");

    expect(button).toBeTruthy();
    expect(button.textContent).toBe("↻");
  });

  it("calls onClick when clicked", () => {
    const mockOnClick = vi.fn();

    render(<RetryButton onClick={mockOnClick} />);

    const button = screen.getByRole("button");

    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("has the correct title attribute", () => {
    const mockOnClick = vi.fn();

    render(<RetryButton onClick={mockOnClick} />);

    const button = screen.getByRole("button");

    expect(button.getAttribute("title")).toBe("Retry from your last message");
  });
});
