// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { SettingsFooter } from "#webui/components/settings/SettingsFooter";

describe("SettingsFooter", () => {
  const defaultProps = {
    settingsConfigured: true,
    saveSettings: vi.fn(),
    cancelSettings: vi.fn(),
    pulse: false,
    hasUnsavedChanges: false,
  };

  it("renders Save button", () => {
    render(<SettingsFooter {...defaultProps} />);

    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("renders Cancel button when settings are configured", () => {
    render(<SettingsFooter {...defaultProps} />);

    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("hides Cancel button when settings are not configured", () => {
    render(<SettingsFooter {...defaultProps} settingsConfigured={false} />);

    expect(screen.queryByText("Cancel")).toBeNull();
  });

  it("shows storage message when settings are not configured", () => {
    render(<SettingsFooter {...defaultProps} settingsConfigured={false} />);

    expect(
      screen.getByText("Settings will be stored in this web browser."),
    ).toBeTruthy();
  });

  it("does not show storage message when settings are configured", () => {
    render(<SettingsFooter {...defaultProps} />);

    expect(
      screen.queryByText("Settings will be stored in this web browser."),
    ).toBeNull();
  });

  it("shows unsaved changes warning when hasUnsavedChanges is true", () => {
    render(<SettingsFooter {...defaultProps} hasUnsavedChanges={true} />);

    expect(
      screen.getByText("You have unsaved changes. Save or cancel to dismiss."),
    ).toBeTruthy();
  });

  it("does not show unsaved changes warning when hasUnsavedChanges is false", () => {
    render(<SettingsFooter {...defaultProps} />);

    expect(
      screen.queryByText(
        "You have unsaved changes. Save or cancel to dismiss.",
      ),
    ).toBeNull();
  });

  it("calls saveSettings when Save is clicked", () => {
    const saveSettings = vi.fn();

    render(<SettingsFooter {...defaultProps} saveSettings={saveSettings} />);
    fireEvent.click(screen.getByText("Save"));

    expect(saveSettings).toHaveBeenCalledOnce();
  });

  it("calls cancelSettings when Cancel is clicked", () => {
    const cancelSettings = vi.fn();

    render(
      <SettingsFooter {...defaultProps} cancelSettings={cancelSettings} />,
    );
    fireEvent.click(screen.getByText("Cancel"));

    expect(cancelSettings).toHaveBeenCalledOnce();
  });

  it("applies pulse class to buttons when pulse is true", () => {
    const { container } = render(
      <SettingsFooter {...defaultProps} pulse={true} />,
    );
    const buttons = container.querySelectorAll("button");

    for (const button of buttons) {
      expect(button.className).toContain("settings-button-pulse");
    }
  });

  it("does not apply pulse class when pulse is false", () => {
    const { container } = render(<SettingsFooter {...defaultProps} />);
    const buttons = container.querySelectorAll("button");

    for (const button of buttons) {
      expect(button.className).not.toContain("settings-button-pulse");
    }
  });
});
