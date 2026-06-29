// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { BranchNav } from "#webui/components/chat/controls/BranchNav";

/** @returns The previous-version arrow button. */
function prevButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: /previous version/i,
  }) as HTMLButtonElement;
}

/** @returns The next-version arrow button. */
function nextButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: /next version/i,
  }) as HTMLButtonElement;
}

describe("BranchNav", () => {
  it("shows the current position out of the total", () => {
    render(
      <BranchNav current={2} total={3} onPrev={vi.fn()} onNext={vi.fn()} />,
    );

    expect(screen.getByTestId("branch-nav-position").textContent).toBe("2 / 3");
  });

  it("calls onPrev and onNext when the arrows are clicked", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();

    render(<BranchNav current={2} total={3} onPrev={onPrev} onNext={onNext} />);
    fireEvent.click(screen.getByRole("button", { name: /previous version/i }));
    fireEvent.click(screen.getByRole("button", { name: /next version/i }));

    expect(onPrev).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("disables an arrow when its handler is omitted (first branch)", () => {
    render(<BranchNav current={1} total={3} onNext={vi.fn()} />);

    expect(prevButton().disabled).toBe(true);
    expect(nextButton().disabled).toBe(false);
  });

  it("disables an arrow when its handler is omitted (last branch)", () => {
    render(<BranchNav current={3} total={3} onPrev={vi.fn()} />);

    expect(nextButton().disabled).toBe(true);
    expect(prevButton().disabled).toBe(false);
  });
});
