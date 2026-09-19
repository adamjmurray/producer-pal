// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { SystemPromptNotice } from "#webui/components/chat/assistant/SystemPromptNotice";

const PROMPT =
  "First line of the prompt.\nSecond line only shown when expanded.";

const CUSTOMIZE = { name: "Customize system prompt" };

describe("SystemPromptNotice", () => {
  it("collapses to the first line by default", () => {
    render(<SystemPromptNotice systemInstruction={PROMPT} />);

    expect(screen.getByText("System prompt")).toBeTruthy();
    expect(screen.getByText("First line of the prompt.")).toBeTruthy();
    // The second line is hidden until expanded.
    expect(screen.queryByText(/Second line only shown/)).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("omits the customize link when there is nowhere to send the user", () => {
    render(<SystemPromptNotice systemInstruction={PROMPT} />);

    expect(screen.queryByRole("button", CUSTOMIZE)).toBeNull();
  });

  it("opens the Instructions panel from the customize link", () => {
    const onOpenInstructions = vi.fn();

    render(
      <SystemPromptNotice
        systemInstruction={PROMPT}
        onOpenInstructions={onOpenInstructions}
      />,
    );

    const customize = screen.getByRole("button", CUSTOMIZE);

    // The tooltip is where the "edits apply to new chats" caveat lives.
    expect(customize.getAttribute("title")).toContain("new chats");
    fireEvent.click(customize);
    expect(onOpenInstructions).toHaveBeenCalledTimes(1);
    // Customizing must not double as expanding the notice.
    expect(
      screen.getByRole("button", { expanded: false }).textContent,
    ).toContain("System prompt");
  });

  it("expands to the full text and collapses again on toggle", () => {
    render(<SystemPromptNotice systemInstruction={PROMPT} />);

    const toggle = screen.getByRole("button");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // Expanding reveals the full text, including the second line.
    expect(
      screen.getByText(/Second line only shown when expanded/),
    ).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Second line only shown/)).toBeNull();
  });
});
