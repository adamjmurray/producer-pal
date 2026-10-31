// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { TextWidgetCard } from "#webui/components/gen/TextWidgetCard";

describe("TextWidgetCard", () => {
  it("shows the note, with its title when it has one", () => {
    render(
      <TextWidgetCard
        widget={{ id: "w1", kind: "text", title: "Idea", text: "Try a fill" }}
      />,
    );

    expect(screen.getByText("Idea")).toBeTruthy();
    expect(screen.getByText("Try a fill")).toBeTruthy();
  });

  it("shows just the note when there is no title", () => {
    const { container } = render(
      <TextWidgetCard
        widget={{ id: "w1", kind: "text", text: "Try a fill" }}
      />,
    );

    expect(container.querySelector("h3")).toBeNull();
    expect(screen.getByText("Try a fill")).toBeTruthy();
  });
});
