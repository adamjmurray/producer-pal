// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ToolLimitNotice } from "#webui/components/chat/controls/ToolLimitNotice";

describe("ToolLimitNotice", () => {
  it("renders the tool-call limit message", () => {
    render(<ToolLimitNotice onContinue={vi.fn()} />);

    expect(screen.getByText(/tool-call limit/i)).toBeTruthy();
  });

  it("renders a Continue button", () => {
    render(<ToolLimitNotice onContinue={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("calls onContinue when the Continue button is clicked", () => {
    const onContinue = vi.fn();

    render(<ToolLimitNotice onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("disables the Continue button when disabled is true", () => {
    render(<ToolLimitNotice onContinue={vi.fn()} disabled={true} />);

    const button = screen.getByRole("button", {
      name: "Continue",
    }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
  });

  it("enables the Continue button by default", () => {
    render(<ToolLimitNotice onContinue={vi.fn()} />);

    const button = screen.getByRole("button", {
      name: "Continue",
    }) as HTMLButtonElement;

    expect(button.disabled).toBe(false);
  });
});
