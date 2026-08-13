// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { Tooltip } from "#webui/components/settings/controls/Tooltip";

describe("Tooltip", () => {
  const infoButton = () =>
    screen.getByRole("button", { name: "Tool description" });

  /**
   * Build a DOMRect stub for getBoundingClientRect mocks.
   * @param parts - The rect fields the assertion under test cares about
   * @returns A DOMRect-shaped object
   */
  function rect(parts: Partial<DOMRect>): DOMRect {
    return {
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...parts,
    } as DOMRect;
  }

  /**
   * Stub getBoundingClientRect on every element, keyed by call order — the
   * tooltip div only exists after the first render, so the spy has to live on
   * the prototype. Calls with no entry fall through to the real measurement.
   * @param byCall - Rect fields per 1-based call index
   */
  function stubRects(byCall: Record<number, Partial<DOMRect>>): void {
    const origGetBCR = Element.prototype.getBoundingClientRect;
    let callCount = 0;

    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        callCount++;
        const parts = byCall[callCount];

        return parts ? rect(parts) : origGetBCR.call(this);
      },
    );
  }

  /** Render the tooltip and hover it open. */
  const showTooltip = (): void => {
    render(<Tooltip text="Some description" />);
    fireEvent.mouseEnter(infoButton());
  };

  /** Wait for the tooltip's inline style `prop` to settle on `value`. */
  const expectTooltipStyle = (
    prop: "top" | "left",
    value: string,
  ): Promise<void> =>
    vi.waitFor(() => {
      expect((screen.getByRole("tooltip") as HTMLElement).style[prop]).toBe(
        value,
      );
    });

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

  it("collapses newlines into spaces", () => {
    render(<Tooltip text={"Line one\nLine two"} />);
    fireEvent.click(infoButton());
    expect(screen.getByText("Line one Line two")).toBeDefined();
  });

  it("does not dismiss when clicking inside while pinned", () => {
    render(<Tooltip text={"Line one\nLine two"} />);
    fireEvent.click(infoButton());
    const tooltip = screen.getByRole("tooltip");

    expect(tooltip).toBeDefined();

    // Click inside the tooltip content (not outside)
    fireEvent.mouseDown(tooltip);
    expect(screen.getByRole("tooltip")).toBeDefined();
  });

  it("does not re-show tooltip on mouse enter when already pinned", () => {
    render(<Tooltip text="Some description" />);
    fireEvent.click(infoButton());
    expect(screen.getByText("Some description")).toBeDefined();

    // Mouse enter while pinned should be a no-op — verify by checking
    // that a subsequent mouse leave doesn't dismiss (proves hover state
    // wasn't set, so pinned state is still solely responsible for visibility)
    fireEvent.mouseEnter(infoButton());
    fireEvent.mouseLeave(infoButton());
    expect(screen.getByText("Some description")).toBeDefined();
  });

  it("adjusts position when tooltip overflows viewport", async () => {
    // Set a narrow viewport
    Object.defineProperty(window, "innerWidth", { value: 200, writable: true });

    stubRects({
      // Button (positioning effect), then tooltip (overflow check effect).
      1: {
        top: 0,
        left: 150,
        right: 170,
        bottom: 20,
        width: 20,
        height: 20,
        x: 150,
      },
      2: {
        top: 26,
        left: 150,
        right: 400,
        bottom: 50,
        width: 250,
        height: 24,
        x: 150,
        y: 26,
      },
    });

    showTooltip();

    // Wait for the overflow adjustment to reposition the tooltip.
    // With innerWidth=200 and tooltip width=250: Math.max(8, 200-250-8) = 8
    await expectTooltipStyle("left", "8px");

    vi.restoreAllMocks();
  });

  it("flips above the icon when it would run off the bottom", async () => {
    Object.defineProperty(window, "innerHeight", {
      value: 300,
      writable: true,
    });

    // Button, near the bottom of the viewport; measured again on the re-check.
    const button = { top: 280, left: 10, right: 30, bottom: 300, height: 20 };

    stubRects({
      1: button,
      3: button,
      // Tooltip, rendered below the button and hanging off the bottom.
      2: { top: 306, left: 10, right: 110, bottom: 406, height: 100 },
    });

    showTooltip();

    // Flipped: button top (280) - tooltip height (100) - gap (6) = 174
    await expectTooltipStyle("top", "174px");

    vi.restoreAllMocks();
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
