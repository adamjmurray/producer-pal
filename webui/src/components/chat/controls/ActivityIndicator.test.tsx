// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { ActivityIndicator } from "./ActivityIndicator";

describe("ActivityIndicator", () => {
  it("renders without errors", () => {
    const { container } = render(<ActivityIndicator />);

    expect(container).toBeDefined();
  });

  it("renders an SVG element", () => {
    const { container } = render(<ActivityIndicator />);
    const svg = container.querySelector("svg");

    expect(svg).toBeDefined();
  });

  it("renders wave paths", () => {
    const { container } = render(<ActivityIndicator />);
    const paths = container.querySelectorAll("path");

    expect(paths).toHaveLength(2);
  });

  it("renders circles", () => {
    const { container } = render(<ActivityIndicator />);
    const circles = container.querySelectorAll("circle");

    expect(circles).toHaveLength(2);
  });

  it("has proper SVG dimensions", () => {
    const { container } = render(<ActivityIndicator />);
    const svg = container.querySelector("svg");

    expect(svg!.getAttribute("width")).toBe("400");
    expect(svg!.getAttribute("height")).toBe("40");
  });

  it("includes animation filter", () => {
    const { container } = render(<ActivityIndicator />);
    const filter = container.querySelector("filter#blur");

    expect(filter).toBeDefined();
  });

  it("includes CSS animations in style tag", () => {
    const { container } = render(<ActivityIndicator />);
    const style = container.querySelector("style");

    expect(style).toBeDefined();
    expect(style!.textContent).toContain("@keyframes pulse1");
    expect(style!.textContent).toContain("@keyframes pulse2");
    expect(style!.textContent).toContain("@keyframes colorShift1");
    expect(style!.textContent).toContain("@keyframes colorShift2");
  });
});
