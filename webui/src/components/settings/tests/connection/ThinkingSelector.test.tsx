// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ThinkingSelector } from "#webui/components/settings/helpers/ThinkingSelector";

describe("ThinkingSelector", () => {
  it("calls setThinking when a new option is selected", () => {
    const setThinking = vi.fn();

    render(<ThinkingSelector thinking="Default" setThinking={setThinking} />);

    const select = screen.getByRole("combobox");

    fireEvent.change(select, { target: { value: "Max" } });

    expect(setThinking).toHaveBeenCalledWith("Max");
  });

  it("renders with the current thinking value selected", () => {
    render(<ThinkingSelector thinking="Off" setThinking={vi.fn()} />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;

    expect(select.value).toBe("Off");
  });
});
