// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { SettingsTabs } from "#webui/components/settings/SettingsTabs";

describe("SettingsTabs", () => {
  it("renders the tabs and the active tab's content, and changes tab on click", () => {
    const onTabChange = vi.fn();

    render(
      <SettingsTabs activeTab="tools" onTabChange={onTabChange}>
        {(tab) => <p>content for {tab}</p>}
      </SettingsTabs>,
    );

    expect(screen.getByText("content for tools")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Installation" }));
    expect(onTabChange).toHaveBeenCalledWith("installation");
  });

  it("marks only the tabs that need attention", () => {
    render(
      <SettingsTabs
        activeTab="connection"
        onTabChange={vi.fn()}
        attention={["installation"]}
      >
        {() => <p>content</p>}
      </SettingsTabs>,
    );

    const dots = screen.getAllByLabelText("needs attention");

    expect(dots).toHaveLength(1);
    expect(
      within(
        screen.getByRole("button", { name: /Installation/ }),
      ).getByLabelText("needs attention"),
    ).toBe(dots[0]);
  });

  it("shows no dot by default", () => {
    render(
      <SettingsTabs activeTab="connection" onTabChange={vi.fn()}>
        {() => <p>content</p>}
      </SettingsTabs>,
    );

    expect(screen.queryByLabelText("needs attention")).toBeNull();
  });
});
