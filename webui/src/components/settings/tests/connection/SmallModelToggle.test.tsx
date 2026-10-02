// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { SmallModelToggle } from "#webui/components/settings/helpers/SmallModelToggle";

describe("SmallModelToggle", () => {
  it("calls setSmallModelMode when checkbox is toggled on", () => {
    const setSmallModelMode = vi.fn();

    render(
      <SmallModelToggle
        smallModelMode={false}
        setSmallModelMode={setSmallModelMode}
      />,
    );

    const checkbox = screen.getByRole("checkbox");

    fireEvent.change(checkbox, { target: { checked: true } });

    expect(setSmallModelMode).toHaveBeenCalledWith(true);
  });

  it("calls setSmallModelMode when checkbox is toggled off", () => {
    const setSmallModelMode = vi.fn();

    render(
      <SmallModelToggle
        smallModelMode={true}
        setSmallModelMode={setSmallModelMode}
      />,
    );

    const checkbox = screen.getByRole("checkbox");

    fireEvent.change(checkbox, { target: { checked: false } });

    expect(setSmallModelMode).toHaveBeenCalledWith(false);
  });
});
