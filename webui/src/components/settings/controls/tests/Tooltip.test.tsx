// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { Tooltip } from "#webui/components/settings/controls/Tooltip";

describe("Tooltip", () => {
  const infoButton = () =>
    screen.getByRole("button", { name: "Tool description" });

  it("renders info icon button", () => {
    render(<Tooltip text="Some description" />);
    expect(infoButton()).toBeDefined();
  });

  it("does not show tooltip by default", () => {
    render(<Tooltip text="Some description" />);
    expect(screen.queryByText("Some description")).toBeNull();
  });

  it("shows tooltip on mouse enter", () => {
    render(<Tooltip text="Some description" />);
    fireEvent.mouseEnter(infoButton());
    expect(screen.getByText("Some description")).toBeDefined();
  });

  it("hides tooltip on mouse leave", () => {
    render(<Tooltip text="Some description" />);
    fireEvent.mouseEnter(infoButton());
    fireEvent.mouseLeave(infoButton());
    expect(screen.queryByText("Some description")).toBeNull();
  });

  it("shows tooltip on click (tap)", () => {
    render(<Tooltip text="Some description" />);
    fireEvent.click(infoButton());
    expect(screen.getByText("Some description")).toBeDefined();
  });

  it("hides tooltip on second click", () => {
    render(<Tooltip text="Some description" />);
    fireEvent.click(infoButton());
    fireEvent.click(infoButton());
    expect(screen.queryByText("Some description")).toBeNull();
  });

  it("keeps tooltip visible on mouse leave when pinned by click", () => {
    render(<Tooltip text="Some description" />);
    fireEvent.click(infoButton());
    fireEvent.mouseLeave(infoButton());
    expect(screen.getByText("Some description")).toBeDefined();
  });

  it("dismisses pinned tooltip on click outside", () => {
    render(
      <div>
        <Tooltip text="Some description" />
        <span data-testid="outside">outside</span>
      </div>,
    );
    fireEvent.click(infoButton());
    expect(screen.getByText("Some description")).toBeDefined();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText("Some description")).toBeNull();
  });

  it("renders multi-line text as separate paragraphs", () => {
    render(<Tooltip text={"Line one\nLine two"} />);
    fireEvent.click(infoButton());
    expect(screen.getByText("Line one")).toBeDefined();
    expect(screen.getByText("Line two")).toBeDefined();
  });

  it("does not propagate click event", () => {
    let parentClicked = false;
    const handleParentClick = () => (parentClicked = true);

    render(
      <div onClick={handleParentClick}>
        <Tooltip text="Some description" />
      </div>,
    );
    fireEvent.click(infoButton());
    expect(parentClicked).toBe(false);
  });
});
