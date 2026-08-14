// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_TOOL_STEPS,
  MAX_TOOL_STEPS_LIMIT,
  MIN_TOOL_STEPS,
} from "#webui/chat/sdk/step-budget";
import { PreferencesTab } from "#webui/components/settings/PreferencesTab";

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
    autoUpdateCheck: true,
    setAutoUpdateCheck: vi.fn(),
    maxToolSteps: DEFAULT_MAX_TOOL_STEPS,
    setMaxToolSteps: vi.fn(),
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

  it("calls setAutoUpdateCheck when checkbox toggled", () => {
    const setAutoUpdateCheck = vi.fn();
    const { container } = render(
      <PreferencesTab
        {...defaultProps}
        setAutoUpdateCheck={setAutoUpdateCheck}
      />,
    );
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    fireEvent.click(checkboxes[3]!);
    expect(setAutoUpdateCheck).toHaveBeenCalledWith(false);
  });

  it("shows the step budget with the supported range on the input", () => {
    const { container } = render(
      <PreferencesTab {...defaultProps} maxToolSteps={40} />,
    );
    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="max-tool-steps"]',
    );

    expect(input?.value).toBe("40");
    expect(input?.min).toBe(String(MIN_TOOL_STEPS));
    expect(input?.max).toBe(String(MAX_TOOL_STEPS_LIMIT));
  });

  it("commits an in-range step budget", () => {
    const setMaxToolSteps = vi.fn();
    const { container } = render(
      <PreferencesTab {...defaultProps} setMaxToolSteps={setMaxToolSteps} />,
    );
    const input = container.querySelector('[data-testid="max-tool-steps"]')!;

    fireEvent.input(input, { target: { value: "40" } });

    expect(setMaxToolSteps).toHaveBeenCalledWith(40);
  });

  it.each([
    ["blank while retyping", ""],
    ["below the floor", String(MIN_TOOL_STEPS - 1)],
    ["above the ceiling", String(MAX_TOOL_STEPS_LIMIT + 1)],
    ["fractional", "12.5"],
  ])("ignores a %s value rather than running a turn on it", (_label, value) => {
    const setMaxToolSteps = vi.fn();
    const { container } = render(
      <PreferencesTab {...defaultProps} setMaxToolSteps={setMaxToolSteps} />,
    );
    const input = container.querySelector('[data-testid="max-tool-steps"]')!;

    fireEvent.input(input, { target: { value } });

    expect(setMaxToolSteps).not.toHaveBeenCalled();
  });

  it("lets a rejected value stay visible while the field has focus", () => {
    // Typing "1" on the way to "15" must not be yanked out from under the
    // cursor; it just hasn't reached the settings buffer yet.
    const { container } = render(<PreferencesTab {...defaultProps} />);
    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="max-tool-steps"]',
    )!;

    fireEvent.input(input, { target: { value: "1" } });

    expect(input.value).toBe("1");
  });

  it.each([
    ["below the floor", String(MIN_TOOL_STEPS - 1)],
    ["blank", ""],
    ["fractional", "12.5"],
  ])("snaps a %s draft back to the committed budget on blur", (_l, value) => {
    // Otherwise the field sits there reading like a budget the next turn will
    // use, while Save writes the old one.
    const { container } = render(
      <PreferencesTab {...defaultProps} maxToolSteps={30} />,
    );
    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="max-tool-steps"]',
    )!;

    fireEvent.input(input, { target: { value } });
    fireEvent.blur(input);

    expect(input.value).toBe("30");
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
