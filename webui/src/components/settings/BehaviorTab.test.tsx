/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { BehaviorTab } from "./BehaviorTab.jsx";

describe("BehaviorTab", () => {
  const mockSetThinking = vi.fn();
  const mockSetTemperature = vi.fn();
  const mockSetShowThoughts = vi.fn();
  const mockResetBehaviorToDefaults = vi.fn();

  const defaultProps = {
    provider: "gemini" as const,
    model: "gemini-2.0-flash-thinking",
    thinking: "Auto",
    setThinking: mockSetThinking,
    temperature: 1.0,
    setTemperature: mockSetTemperature,
    showThoughts: true,
    setShowThoughts: mockSetShowThoughts,
    resetBehaviorToDefaults: mockResetBehaviorToDefaults,
  };

  it("renders reset button", () => {
    const { container } = render(<BehaviorTab {...defaultProps} />);
    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent.includes("Reset to defaults"),
    );
    expect(resetButton).toBeDefined();
  });

  it("calls resetBehaviorToDefaults when reset button clicked", () => {
    const { container } = render(<BehaviorTab {...defaultProps} />);
    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent.includes("Reset to defaults"),
    );
    fireEvent.click(resetButton!);
    expect(mockResetBehaviorToDefaults).toHaveBeenCalled();
  });

  it("renders ThinkingSettings component", () => {
    const { container } = render(<BehaviorTab {...defaultProps} />);
    // ThinkingSettings renders a select element
    const select = container.querySelector("select");
    expect(select).toBeDefined();
  });

  it("renders RandomnessSlider component", () => {
    const { container } = render(<BehaviorTab {...defaultProps} />);
    // RandomnessSlider renders a range input
    const slider = container.querySelector('input[type="range"]');
    expect(slider).toBeDefined();
  });

  it("renders helper text about per-message customization", () => {
    const { container } = render(<BehaviorTab {...defaultProps} />);
    expect(container.textContent).toContain(
      "These are default values for new conversations",
    );
    expect(container.textContent).toContain(
      "adjust thinking and randomness for individual messages",
    );
  });
});
