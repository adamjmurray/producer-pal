// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { EditButton } from "./EditButton";

describe("EditButton", () => {
  it("renders the edit button", () => {
    render(<EditButton onClick={vi.fn()} />);

    const button = screen.getByRole("button");

    expect(button).toBeTruthy();
    expect(button.textContent).toBe("✎");
  });

  it("calls onClick when clicked", () => {
    const mockOnClick = vi.fn();

    render(<EditButton onClick={mockOnClick} />);
    fireEvent.click(screen.getByRole("button"));

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("has the correct title attribute", () => {
    render(<EditButton onClick={vi.fn()} />);

    expect(screen.getByRole("button").getAttribute("title")).toBe(
      "Edit message",
    );
  });
});
