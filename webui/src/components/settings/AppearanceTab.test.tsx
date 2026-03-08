// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { AppearanceTab } from "./AppearanceTab";

describe("AppearanceTab", () => {
  const mockSetTheme = vi.fn();

  const defaultProps = {
    theme: "system",
    setTheme: mockSetTheme,
    showTimestamps: false,
    setShowTimestamps: vi.fn(),
  };

  it("renders theme label", () => {
    const { container } = render(<AppearanceTab {...defaultProps} />);
    const label = container.querySelector("label");

    expect(label?.textContent).toBe("Theme");
  });

  it("renders theme select with correct value", () => {
    const { container } = render(<AppearanceTab {...defaultProps} />);
    const select = container.querySelector("select") as HTMLSelectElement;

    expect(select.value).toBe("system");
  });

  it("renders all theme options", () => {
    const { container } = render(<AppearanceTab {...defaultProps} />);
    const select = container.querySelector("select");

    expect(select?.innerHTML).toContain("System");
    expect(select?.innerHTML).toContain("Light");
    expect(select?.innerHTML).toContain("Dark");
  });

  it("calls setTheme when selection changes", () => {
    const { container } = render(<AppearanceTab {...defaultProps} />);
    const select = container.querySelector("select");

    fireEvent.change(select!, { target: { value: "dark" } });
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("renders with light theme selected", () => {
    const { container } = render(
      <AppearanceTab {...defaultProps} theme="light" />,
    );
    const select = container.querySelector("select") as HTMLSelectElement;

    expect(select.value).toBe("light");
  });

  it("renders with dark theme selected", () => {
    const { container } = render(
      <AppearanceTab {...defaultProps} theme="dark" />,
    );
    const select = container.querySelector("select") as HTMLSelectElement;

    expect(select.value).toBe("dark");
  });

  it("calls setShowTimestamps when checkbox toggled", () => {
    const setShowTimestamps = vi.fn();
    const { container } = render(
      <AppearanceTab {...defaultProps} setShowTimestamps={setShowTimestamps} />,
    );
    const checkbox = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;

    fireEvent.click(checkbox);
    expect(setShowTimestamps).toHaveBeenCalled();
  });
});
