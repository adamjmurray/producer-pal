// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ThinkingToggle } from "#webui/components/chat/controls/ThinkingToggle";

describe("ThinkingToggle", () => {
  it("renders a button with the current thinking level in aria-label", () => {
    render(<ThinkingToggle thinking="Default" onThinkingChange={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /Thinking level: Default/ }),
    ).toBeDefined();
  });

  it("shows Off level in aria-label", () => {
    render(<ThinkingToggle thinking="Off" onThinkingChange={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /Thinking level: Off/ }),
    ).toBeDefined();
  });

  it("shows Max level in aria-label", () => {
    render(<ThinkingToggle thinking="Max" onThinkingChange={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /Thinking level: Max/ }),
    ).toBeDefined();
  });

  it("cycles Default → Max on click", () => {
    const onThinkingChange = vi.fn();

    render(
      <ThinkingToggle thinking="Default" onThinkingChange={onThinkingChange} />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(onThinkingChange).toHaveBeenCalledWith("Max");
  });

  it("cycles Max → Off on click", () => {
    const onThinkingChange = vi.fn();

    render(
      <ThinkingToggle thinking="Max" onThinkingChange={onThinkingChange} />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(onThinkingChange).toHaveBeenCalledWith("Off");
  });

  it("cycles Off → Default on click", () => {
    const onThinkingChange = vi.fn();

    render(
      <ThinkingToggle thinking="Off" onThinkingChange={onThinkingChange} />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(onThinkingChange).toHaveBeenCalledWith("Default");
  });

  it("cycles unknown level → Default on click", () => {
    const onThinkingChange = vi.fn();

    render(
      <ThinkingToggle thinking="Legacy" onThinkingChange={onThinkingChange} />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(onThinkingChange).toHaveBeenCalledWith("Default");
  });
});
