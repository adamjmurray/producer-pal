// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { SystemPromptNotice } from "#webui/components/chat/assistant/SystemPromptNotice";

const PROMPT =
  "First line of the prompt.\nSecond line only shown when expanded.";

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
