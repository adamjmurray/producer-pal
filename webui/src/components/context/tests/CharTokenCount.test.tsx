// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { CharTokenCount } from "#webui/components/context/CharTokenCount";

describe("CharTokenCount", () => {
  it("shows the char count and an approximate token count", () => {
    render(<CharTokenCount chars={400} />);

    expect(screen.getByText(/400 chars · ≈100 tokens/)).toBeTruthy();
  });

  it("thousands-separates large counts", () => {
    render(<CharTokenCount chars={1500} />);

    // 1500 chars → ceil(1500/4) = 375 tokens, both locale-formatted.
    expect(screen.getByText(/1,500 chars · ≈375 tokens/)).toBeTruthy();
  });

  it("merges an extra className", () => {
    const { container } = render(
      <CharTokenCount chars={4} className="shrink-0" />,
    );

    expect(container.querySelector("span")?.className).toContain("shrink-0");
  });
});
