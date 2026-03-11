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
  const mockOnShowThoughtsChange = vi.fn();
  const mockOnResetToDefaults = vi.fn();

  const defaultProps = {
    provider: "gemini" as const,
    model: "gemini-2.0-flash-thinking",
    defaultThinking: "Default",
    defaultShowThoughts: true,
    thinking: "Default",
    showThoughts: true,
    onThinkingChange: mockOnThinkingChange,
    onShowThoughtsChange: mockOnShowThoughtsChange,
    onResetToDefaults: mockOnResetToDefaults,
  };

  it("renders thinking dropdown with current value", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const select = container.querySelector("select") as HTMLSelectElement;

    expect(select).toBeDefined();
    expect(select.value).toBe("Default");
  });

  it.each([
    ["o1", "openai"],
    ["o3-mini", "openai"],
  ] as const)("hides Off and Ultra options for %s model", (model, provider) => {
    const { container } = render(
      <MessageSettingsToolbar
        {...defaultProps}
        provider={provider}
        model={model}
      />,
    );
    const select = container.querySelector("select");

    expect(select?.innerHTML).not.toContain("Off");
    expect(select?.innerHTML).not.toContain("Ultra");
  });

  it("shows all thinking options for Gemini", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const select = container.querySelector("select");

    expect(select?.innerHTML).toContain("Default");
    expect(select?.innerHTML).toContain("Off");
    expect(select?.innerHTML).toContain("Ultra");
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

  it("shows Defaults link when onOpenBehaviorSettings provided", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <MessageSettingsToolbar
        {...defaultProps}
        thinking="High"
        onOpenBehaviorSettings={onOpen}
      />,
    );
    const defaultsButton = Array.from(
      container.querySelectorAll("button"),
    ).find((btn) => btn.textContent === "Defaults");

    expect(defaultsButton).toBeDefined();
    fireEvent.click(defaultsButton!);
    expect(onOpen).toHaveBeenCalled();
  });

  it("disables Defaults link when using defaults", () => {
    const { container } = render(
      <MessageSettingsToolbar
        {...defaultProps}
        onOpenBehaviorSettings={vi.fn()}
      />,
    );
    const defaultsButton = Array.from(
      container.querySelectorAll("button"),
    ).find((btn) => btn.textContent === "Defaults") as HTMLButtonElement;

    expect(defaultsButton.disabled).toBe(true);
  });
});
