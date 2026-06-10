// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { CompactButton } from "#webui/components/chat/controls/CompactButton";

describe("CompactButton", () => {
  it("calls onClick when clicked", () => {
    const onClick = vi.fn();

    render(<CompactButton onClick={onClick} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /compact the conversation up to here/i,
      }),
    );

    expect(onClick).toHaveBeenCalledOnce();
  });
});
