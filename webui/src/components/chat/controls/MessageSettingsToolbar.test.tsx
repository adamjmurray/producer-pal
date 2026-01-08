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

  it("renders collapsed by default", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const toolbar = container.querySelector(".w-full.px-4.py-2");

    expect(toolbar).toBeDefined();
    expect(toolbar?.textContent).toContain("▶");
  });

  it("expands when clicked", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const button = container.querySelector("button");

    fireEvent.click(button!);
    expect(container.textContent).toContain("▼");
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
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const button = container.querySelector("button");

    fireEvent.click(button!);

    const select = container.querySelector("select");

    expect(select?.innerHTML).toContain("Default");
    expect(select?.innerHTML).toContain("Off");
    expect(select?.innerHTML).toContain("Ultra");
  });

  it("calls onThinkingChange when thinking changes", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const button = container.querySelector("button");

    fireEvent.click(button!);

    const select = container.querySelector("select");

    fireEvent.change(select!, { target: { value: "High" } });
    expect(mockOnThinkingChange).toHaveBeenCalledWith("High");
  });

  it("calls onTemperatureChange when slider changes", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const button = container.querySelector("button");

    fireEvent.click(button!);

    const slider = container.querySelector('input[type="range"]');

    fireEvent.input(slider!, { target: { value: "1.5" } });
    expect(mockOnTemperatureChange).toHaveBeenCalledWith(1.5);
  });

  it("calls onResetToDefaults when reset button clicked", () => {
    const { container } = render(
      <MessageSettingsToolbar {...defaultProps} thinking="High" />,
    );
    const button = container.querySelector("button");

    fireEvent.click(button!);

    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent.includes("Use defaults"),
    );

    fireEvent.click(resetButton!);
    expect(mockOnResetToDefaults).toHaveBeenCalled();
  });

  it("disables reset button when using defaults", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const button = container.querySelector("button");

    fireEvent.click(button!);

    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent.includes("Use defaults"),
    );

    expect(resetButton?.disabled).toBe(true);
  });

  it("collapses when clicked again", () => {
    const { container } = render(<MessageSettingsToolbar {...defaultProps} />);
    const button = container.querySelector("button");

    fireEvent.click(button!);
    expect(container.textContent).toContain("▼");
    fireEvent.click(button!);
    expect(container.textContent).toContain("▶");
  });
});
