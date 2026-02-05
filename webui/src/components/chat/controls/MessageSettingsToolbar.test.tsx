// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { MessageSettingsToolbar } from "./MessageSettingsToolbar";

describe("MessageSettingsToolbar", () => {
  const mockOnThinkingChange = vi.fn();
  const mockOnTemperatureChange = vi.fn();
  const mockOnShowThoughtsChange = vi.fn();
  const mockOnResetToDefaults = vi.fn();

  const defaultProps = {
    provider: "gemini" as const,
    model: "gemini-2.0-flash-thinking",
    defaultThinking: "Default",
    defaultTemperature: 1.0,
    defaultShowThoughts: true,
    thinking: "Default",
    temperature: 1.0,
    showThoughts: true,
    onThinkingChange: mockOnThinkingChange,
    onTemperatureChange: mockOnTemperatureChange,
    onShowThoughtsChange: mockOnShowThoughtsChange,
    onResetToDefaults: mockOnResetToDefaults,
  };

  /**
   * Render toolbar expanded and return container
   * @param props - Props to pass to MessageSettingsToolbar
   * @returns Container element
   */
  function renderExpanded(props = defaultProps) {
    const { container } = render(<MessageSettingsToolbar {...props} />);

    fireEvent.click(container.querySelector("button")!);

    return container;
  }

  it("renders collapsed by default", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const toolbar = container.querySelector(".w-full.px-4.py-2");

    expect(toolbar).toBeDefined();
    expect(toolbar?.textContent).toContain("▶");
  });

  it("expands and collapses when clicked", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const button = container.querySelector("button");

    fireEvent.click(button!);
    expect(container.textContent).toContain("▼");
    fireEvent.click(button!);
    expect(container.textContent).toContain("▶");
  });

  it.each([{ thinking: "High" }, { temperature: 1.5 }])(
    "shows customized indicator when $thinking$temperature differs from default",
    (propOverride) => {
      const { container } = render(
        <MessageSettingsToolbar {...defaultProps} {...propOverride} />,
      );

      expect(container.textContent).toContain("(customized)");
    },
  );

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
    const button = container.querySelector("button");

    fireEvent.click(button!);

    const select = container.querySelector("select");

    expect(select?.innerHTML).not.toContain("Off");
    expect(select?.innerHTML).not.toContain("Ultra");
  });

  it("shows all thinking options for Gemini", () => {
    const container = renderExpanded();
    const select = container.querySelector("select");

    expect(select?.innerHTML).toContain("Default");
    expect(select?.innerHTML).toContain("Off");
    expect(select?.innerHTML).toContain("Ultra");
  });

  it("calls onThinkingChange when thinking changes", () => {
    const container = renderExpanded();
    const select = container.querySelector("select");

    fireEvent.change(select!, { target: { value: "High" } });
    expect(mockOnThinkingChange).toHaveBeenCalledWith("High");
  });

  it("calls onTemperatureChange when slider changes", () => {
    const container = renderExpanded();
    const slider = container.querySelector('input[type="range"]');

    fireEvent.input(slider!, { target: { value: "1.5" } });
    expect(mockOnTemperatureChange).toHaveBeenCalledWith(1.5);
  });

  it("calls onResetToDefaults when reset button clicked", () => {
    const container = renderExpanded({ ...defaultProps, thinking: "High" });
    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent.includes("Use defaults"),
    );

    fireEvent.click(resetButton!);
    expect(mockOnResetToDefaults).toHaveBeenCalled();
  });

  it("disables reset button when using defaults", () => {
    const container = renderExpanded();
    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent.includes("Use defaults"),
    );

    expect(resetButton?.disabled).toBe(true);
  });
});
