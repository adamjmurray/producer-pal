// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { PreferencesTab } from "./PreferencesTab";

describe("PreferencesTab", () => {
  const mockSetTheme = vi.fn();

  const defaultProps = {
    theme: "system",
    setTheme: mockSetTheme,
    showTimestamps: false,
    setShowTimestamps: vi.fn(),
    showHelpLinks: true,
    setShowHelpLinks: vi.fn(),
  };

  it("renders theme label", () => {
    const { container } = render(<PreferencesTab {...defaultProps} />);
    const label = container.querySelector('[for="theme-select"]');

    expect(label?.textContent).toBe("Theme");
  });

  it("renders theme select with correct value", () => {
    const { container } = render(<PreferencesTab {...defaultProps} />);
    const select = container.querySelector(
      "#theme-select",
    ) as HTMLSelectElement;

    expect(select.value).toBe("system");
  });

  it("renders all theme options", () => {
    const { container } = render(<PreferencesTab {...defaultProps} />);
    const select = container.querySelector("#theme-select");

    expect(select?.innerHTML).toContain("System");
    expect(select?.innerHTML).toContain("Light");
    expect(select?.innerHTML).toContain("Dark");
  });

  it("calls setTheme when selection changes", () => {
    const { container } = render(<PreferencesTab {...defaultProps} />);
    const select = container.querySelector("#theme-select");

    fireEvent.change(select!, { target: { value: "dark" } });
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("renders with light theme selected", () => {
    const { container } = render(
      <PreferencesTab {...defaultProps} theme="light" />,
    );
    const select = container.querySelector(
      "#theme-select",
    ) as HTMLSelectElement;

    expect(select.value).toBe("light");
  });

  it("renders with dark theme selected", () => {
    const { container } = render(
      <PreferencesTab {...defaultProps} theme="dark" />,
    );
    const select = container.querySelector(
      "#theme-select",
    ) as HTMLSelectElement;

    expect(select.value).toBe("dark");
  });

  it("calls setShowTimestamps when checkbox toggled", () => {
    const setShowTimestamps = vi.fn();
    const { container } = render(
      <PreferencesTab
        {...defaultProps}
        setShowTimestamps={setShowTimestamps}
      />,
    );
    const checkbox = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;

    fireEvent.click(checkbox);
    expect(setShowTimestamps).toHaveBeenCalled();
  });

  it("calls setShowHelpLinks when checkbox toggled", () => {
    const setShowHelpLinks = vi.fn();
    const { container } = render(
      <PreferencesTab {...defaultProps} setShowHelpLinks={setShowHelpLinks} />,
    );
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    fireEvent.click(checkboxes[1]!);
    expect(setShowHelpLinks).toHaveBeenCalled();
  });
});
