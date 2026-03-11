// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { MessageSettingsToolbar } from "#webui/components/chat/controls/MessageSettingsToolbar";

describe("MessageSettingsToolbar", () => {
  const mockOnThinkingChange = vi.fn();
  const mockOnResetToDefaults = vi.fn();

  const defaultProps = {
    defaultThinking: "Adaptive",
    thinking: "Adaptive",
    onThinkingChange: mockOnThinkingChange,
    onResetToDefaults: mockOnResetToDefaults,
  };

  it("renders thinking dropdown with current value", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const select = container.querySelector("select") as HTMLSelectElement;

    expect(select).toBeDefined();
    expect(select.value).toBe("Adaptive");
  });

  it("shows all thinking options", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const select = container.querySelector("select");

    expect(select?.innerHTML).toContain("Adaptive");
    expect(select?.innerHTML).toContain("Low");
    expect(select?.innerHTML).toContain("Medium");
    expect(select?.innerHTML).toContain("High");
  });

  it("calls onThinkingChange when thinking changes", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const select = container.querySelector("select");

    fireEvent.change(select!, { target: { value: "High" } });
    expect(mockOnThinkingChange).toHaveBeenCalledWith("High");
  });

  it("calls onResetToDefaults when reset button clicked", () => {
    const { container } = render(
      <MessageSettingsToolbar {...defaultProps} thinking="High" />,
    );
    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent.includes("Reset"),
    );

    fireEvent.click(resetButton!);
    expect(mockOnResetToDefaults).toHaveBeenCalled();
  });

  it("disables reset button when using defaults", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent.includes("Reset"),
    );

    expect(resetButton?.disabled).toBe(true);
  });
});
