// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useSyncServerSetting } from "#webui/hooks/connection/use-sync-server-setting";

describe("useSyncServerSetting", () => {
  it("seeds local from server on initial render when not dirty", () => {
    const seed = vi.fn();

    renderHook(() => useSyncServerSetting(true, false, seed));

    expect(seed).toHaveBeenCalledWith(true);
  });

  it("does not seed when dirty (user has touched the modal control)", () => {
    const seed = vi.fn();

    renderHook(() => useSyncServerSetting(true, true, seed));

    expect(seed).not.toHaveBeenCalled();
  });

  it("reseeds when serverValue changes and not dirty", () => {
    const seed = vi.fn();

    const { rerender } = renderHook(
      ({ serverValue, dirty }) =>
        useSyncServerSetting(serverValue, dirty, seed),
      { initialProps: { serverValue: false, dirty: false } },
    );

    expect(seed).toHaveBeenCalledWith(false);
    seed.mockClear();

    rerender({ serverValue: true, dirty: false });

    expect(seed).toHaveBeenCalledWith(true);
  });

  it("ignores server changes that arrive while dirty (user intent wins)", () => {
    const seed = vi.fn();

    const { rerender } = renderHook(
      ({ serverValue, dirty }) =>
        useSyncServerSetting(serverValue, dirty, seed),
      { initialProps: { serverValue: false, dirty: true } },
    );

    expect(seed).not.toHaveBeenCalled();

    rerender({ serverValue: true, dirty: true });

    expect(seed).not.toHaveBeenCalled();
  });

  it("re-syncs from server as soon as dirty clears (e.g. after save or cancel)", () => {
    const seed = vi.fn();

    const { rerender } = renderHook(
      ({ serverValue, dirty }) =>
        useSyncServerSetting(serverValue, dirty, seed),
      { initialProps: { serverValue: true, dirty: true } },
    );

    expect(seed).not.toHaveBeenCalled();

    rerender({ serverValue: true, dirty: false });

    expect(seed).toHaveBeenCalledWith(true);
  });

  it("works with non-boolean values (e.g. the notation enum)", () => {
    const seed = vi.fn<(value: string) => void>();

    const { rerender } = renderHook(
      ({ serverValue, dirty }) =>
        useSyncServerSetting(serverValue, dirty, seed),
      { initialProps: { serverValue: "barbeat", dirty: false } },
    );

    expect(seed).toHaveBeenCalledWith("barbeat");
    seed.mockClear();

    rerender({ serverValue: "midi-json", dirty: false });

    expect(seed).toHaveBeenCalledWith("midi-json");
  });
});
