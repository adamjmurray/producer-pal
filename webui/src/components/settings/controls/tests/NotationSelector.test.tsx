// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { NotationSelector } from "#webui/components/settings/controls/NotationSelector";

describe("NotationSelector", () => {
  it("renders the current notation and all options with friendly labels", () => {
    render(<NotationSelector notation="midi-json" setNotation={vi.fn()} />);

    const select = screen.getByTestId("notation-select") as HTMLSelectElement;

    expect(select.value).toBe("midi-json");
    expect(screen.getByRole("option", { name: "bar|beat" })).toBeDefined();
    expect(screen.getByRole("option", { name: "MIDI JSON" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Stark" })).toBeDefined();
  });

  it("calls setNotation with the selected value", () => {
    const setNotation = vi.fn();

    render(<NotationSelector notation="barbeat" setNotation={setNotation} />);
    const select = screen.getByTestId("notation-select");

    fireEvent.change(select, { target: { value: "stark" } });
    expect(setNotation).toHaveBeenCalledWith("stark");

    fireEvent.change(select, { target: { value: "midi-json" } });
    expect(setNotation).toHaveBeenCalledWith("midi-json");
  });
});
