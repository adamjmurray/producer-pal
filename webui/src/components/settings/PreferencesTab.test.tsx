// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
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
    showTokenUsage: false,
    setShowTokenUsage: vi.fn(),
    onDeleteAllConversations: vi.fn(),
    onDeleteUnbookmarkedConversations: vi.fn(),
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

  it("calls setShowTokenUsage when checkbox toggled", () => {
    const setShowTokenUsage = vi.fn();
    const { container } = render(
      <PreferencesTab
        {...defaultProps}
        setShowTokenUsage={setShowTokenUsage}
      />,
    );
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    fireEvent.click(checkboxes[2]!);
    expect(setShowTokenUsage).toHaveBeenCalled();
  });

  it("renders cleanup buttons", () => {
    render(<PreferencesTab {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "Delete unstarred" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Delete all" })).toBeDefined();
  });

  it.each([
    ["Delete all", "onDeleteAllConversations"],
    ["Delete unstarred", "onDeleteUnbookmarkedConversations"],
  ] as const)("calls %s handler when confirmed", (buttonName, propName) => {
    const handler = vi.fn();

    window.confirm = vi.fn().mockReturnValue(true);
    render(<PreferencesTab {...defaultProps} {...{ [propName]: handler }} />);
    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  it.each([
    ["Delete all", "onDeleteAllConversations"],
    ["Delete unstarred", "onDeleteUnbookmarkedConversations"],
  ] as const)(
    "does not call %s handler when cancelled",
    (buttonName, propName) => {
      const handler = vi.fn();

      window.confirm = vi.fn().mockReturnValue(false);
      render(<PreferencesTab {...defaultProps} {...{ [propName]: handler }} />);
      fireEvent.click(screen.getByRole("button", { name: buttonName }));

      expect(window.confirm).toHaveBeenCalledOnce();
      expect(handler).not.toHaveBeenCalled();
    },
  );
});
