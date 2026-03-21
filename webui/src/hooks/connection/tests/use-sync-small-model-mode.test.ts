// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useSyncSmallModelMode } from "#webui/hooks/connection/use-sync-small-model-mode";

describe("useSyncSmallModelMode", () => {
  it("seeds local from server on initial render when no active conversation", () => {
    const setLocal = vi.fn();
    const postToServer = vi.fn();

    renderHook(() => useSyncSmallModelMode(true, null, setLocal, postToServer));

    expect(setLocal).toHaveBeenCalledWith(true);
    expect(postToServer).not.toHaveBeenCalled();
  });

  it("seeds local with false from server when no active conversation", () => {
    const setLocal = vi.fn();
    const postToServer = vi.fn();

    renderHook(() =>
      useSyncSmallModelMode(false, null, setLocal, postToServer),
    );

    expect(setLocal).toHaveBeenCalledWith(false);
  });

  it("does not seed local when there is an active conversation", () => {
    const setLocal = vi.fn();
    const postToServer = vi.fn();

    renderHook(() =>
      useSyncSmallModelMode(true, false, setLocal, postToServer),
    );

    // setLocal should not be called from the seed effect when activeValue is non-null
    // (the ref-updating effect runs but the seed effect checks activeValueRef)
    expect(setLocal).not.toHaveBeenCalled();
  });

  it("posts to server when activeValue is non-null", () => {
    const setLocal = vi.fn();
    const postToServer = vi.fn();

    renderHook(() =>
      useSyncSmallModelMode(false, true, setLocal, postToServer),
    );

    expect(postToServer).toHaveBeenCalledWith(true);
  });

  it("does not post to server when activeValue is null", () => {
    const setLocal = vi.fn();
    const postToServer = vi.fn();

    renderHook(() =>
      useSyncSmallModelMode(false, null, setLocal, postToServer),
    );

    expect(postToServer).not.toHaveBeenCalled();
  });

  it("updates local when serverValue changes and no active conversation", () => {
    const setLocal = vi.fn();
    const postToServer = vi.fn();

    const { rerender } = renderHook(
      ({ serverValue, activeValue }) =>
        useSyncSmallModelMode(serverValue, activeValue, setLocal, postToServer),
      { initialProps: { serverValue: false, activeValue: null } },
    );

    expect(setLocal).toHaveBeenCalledWith(false);
    setLocal.mockClear();

    rerender({ serverValue: true, activeValue: null });

    expect(setLocal).toHaveBeenCalledWith(true);
  });

  it("posts to server when activeValue changes from null to non-null", () => {
    const setLocal = vi.fn();
    const postToServer = vi.fn();

    const { rerender } = renderHook(
      ({ serverValue, activeValue }) =>
        useSyncSmallModelMode(serverValue, activeValue, setLocal, postToServer),
      {
        initialProps: {
          serverValue: false,
          activeValue: null as boolean | null,
        },
      },
    );

    expect(postToServer).not.toHaveBeenCalled();

    rerender({ serverValue: false, activeValue: true });

    expect(postToServer).toHaveBeenCalledWith(true);
  });
});
