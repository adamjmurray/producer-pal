// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useBackdropClick } from "#webui/hooks/use-backdrop-click";

const backdrop = { id: "backdrop" } as unknown as EventTarget;
const inPanel = { id: "in-panel" } as unknown as EventTarget;

const mouseEvent = (target: EventTarget) => ({ target }) as MouseEvent;

/**
 * Render the hook with a fresh backdrop-click spy.
 * @returns The hook result and the spy
 */
function renderBackdrop() {
  const onBackdropClick = vi.fn();
  const { result } = renderHook(() => useBackdropClick(onBackdropClick));

  return { result, onBackdropClick };
}

/**
 * Drive a press → release → click(s) sequence through the handlers. The clicks
 * always land on the backdrop, as a real overlay click does.
 * @param result - The rendered hook result
 * @param downTarget - Where the press lands
 * @param upTarget - Where the release lands
 * @param clicks - How many clicks follow the release
 * @returns Promise resolving once the sequence has run
 */
async function pressReleaseClick(
  result: ReturnType<typeof renderBackdrop>["result"],
  downTarget: EventTarget,
  upTarget: EventTarget,
  clicks = 1,
): Promise<void> {
  await act(() => {
    result.current.onMouseDown(mouseEvent(downTarget));
    result.current.onMouseUp(mouseEvent(upTarget));

    for (let i = 0; i < clicks; i++) {
      result.current.onClick(mouseEvent(backdrop));
    }
  });
}

describe("useBackdropClick", () => {
  it("reports a click when press and release land on the same element", async () => {
    const { result, onBackdropClick } = renderBackdrop();

    await pressReleaseClick(result, backdrop, backdrop);

    expect(onBackdropClick).toHaveBeenCalledOnce();
  });

  it("ignores a drag that starts inside the panel and ends on the backdrop", async () => {
    const { result, onBackdropClick } = renderBackdrop();

    await pressReleaseClick(result, inPanel, backdrop);

    expect(onBackdropClick).not.toHaveBeenCalled();
  });

  it("ignores a drag that starts on the backdrop and ends inside the panel", async () => {
    // The press alone can't catch this one: the click fires on the overlay, so
    // it matches the press target, and only the release says where it landed.
    const { result, onBackdropClick } = renderBackdrop();

    await pressReleaseClick(result, backdrop, inPanel);

    expect(onBackdropClick).not.toHaveBeenCalled();
  });

  it("ignores a click with no preceding press", async () => {
    const { result, onBackdropClick } = renderBackdrop();

    await act(() => result.current.onClick(mouseEvent(backdrop)));

    expect(onBackdropClick).not.toHaveBeenCalled();
  });

  it("forgets the press target after a click, so the next click needs its own press", async () => {
    const { result, onBackdropClick } = renderBackdrop();

    await pressReleaseClick(result, backdrop, backdrop, 2);

    expect(onBackdropClick).toHaveBeenCalledOnce();
  });
});
