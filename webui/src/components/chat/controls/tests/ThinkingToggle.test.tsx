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
  const defaultProps = {
    thinking: "Adaptive",
    onThinkingChange: vi.fn(),
  };

  it("renders all four thinking level buttons", () => {
    render(<ThinkingToggle {...defaultProps} />);

    expect(screen.getByRole("button", { name: "Adaptive" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Low" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Medium" })).toBeDefined();
    expect(screen.getByRole("button", { name: "High" })).toBeDefined();
  });

  it("shows short labels A, L, M, H", () => {
    render(<ThinkingToggle {...defaultProps} />);

    expect(screen.getByRole("button", { name: "Adaptive" }).textContent).toBe(
      "A",
    );
    expect(screen.getByRole("button", { name: "Low" }).textContent).toBe("L");
    expect(screen.getByRole("button", { name: "Medium" }).textContent).toBe(
      "M",
    );
    expect(screen.getByRole("button", { name: "High" }).textContent).toBe("H");
  });

  it("highlights the active thinking level", () => {
    render(<ThinkingToggle {...defaultProps} thinking="High" />);

    const highBtn = screen.getByRole("button", { name: "High" });
    const adaptiveBtn = screen.getByRole("button", { name: "Adaptive" });

    expect(highBtn.className).toContain("bg-blue-600");
    expect(adaptiveBtn.className).not.toContain("bg-blue-600");
  });

  it("calls onThinkingChange when a button is clicked", () => {
    const onThinkingChange = vi.fn();

    render(
      <ThinkingToggle {...defaultProps} onThinkingChange={onThinkingChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Medium" }));
    expect(onThinkingChange).toHaveBeenCalledWith("Medium");
  });
});
