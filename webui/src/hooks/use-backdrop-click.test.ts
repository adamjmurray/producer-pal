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

describe("useBackdropClick", () => {
  it("reports a click when press and release land on the same element", async () => {
    const onBackdropClick = vi.fn();
    const { result } = renderHook(() => useBackdropClick(onBackdropClick));

    await act(() => {
      result.current.onMouseDown(mouseEvent(backdrop));
      result.current.onMouseUp(mouseEvent(backdrop));
      result.current.onClick(mouseEvent(backdrop));
    });

    expect(onBackdropClick).toHaveBeenCalledOnce();
  });

  it("ignores a drag that starts inside the panel and ends on the backdrop", async () => {
    const onBackdropClick = vi.fn();
    const { result } = renderHook(() => useBackdropClick(onBackdropClick));

    await act(() => {
      result.current.onMouseDown(mouseEvent(inPanel));
      result.current.onMouseUp(mouseEvent(backdrop));
      result.current.onClick(mouseEvent(backdrop));
    });

    expect(onBackdropClick).not.toHaveBeenCalled();
  });

  it("ignores a drag that starts on the backdrop and ends inside the panel", async () => {
    // The press alone can't catch this one: the click fires on the overlay, so
    // it matches the press target, and only the release says where it landed.
    const onBackdropClick = vi.fn();
    const { result } = renderHook(() => useBackdropClick(onBackdropClick));

    await act(() => {
      result.current.onMouseDown(mouseEvent(backdrop));
      result.current.onMouseUp(mouseEvent(inPanel));
      result.current.onClick(mouseEvent(backdrop));
    });

    expect(onBackdropClick).not.toHaveBeenCalled();
  });

  it("ignores a click with no preceding press", async () => {
    const onBackdropClick = vi.fn();
    const { result } = renderHook(() => useBackdropClick(onBackdropClick));

    await act(() => result.current.onClick(mouseEvent(backdrop)));

    expect(onBackdropClick).not.toHaveBeenCalled();
  });

  it("forgets the press target after a click, so the next click needs its own press", async () => {
    const onBackdropClick = vi.fn();
    const { result } = renderHook(() => useBackdropClick(onBackdropClick));

    await act(() => {
      result.current.onMouseDown(mouseEvent(backdrop));
      result.current.onMouseUp(mouseEvent(backdrop));
      result.current.onClick(mouseEvent(backdrop));
      result.current.onClick(mouseEvent(backdrop));
    });

    expect(onBackdropClick).toHaveBeenCalledOnce();
  });
});
