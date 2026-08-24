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

/**
 * Render the sync hook with rerenderable server/dirty props.
 * @param seed - The seed callback under test
 * @param serverValue - The server's value at mount
 * @param dirty - Whether the user has touched the control
 * @returns The rendered hook
 */
function renderSync<T>(
  seed: (value: T) => void,
  serverValue: T,
  dirty: boolean,
) {
  return renderHook(
    (props: { serverValue: T; dirty: boolean }) =>
      useSyncServerSetting(props.serverValue, props.dirty, seed),
    { initialProps: { serverValue, dirty } },
  );
}

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

    const { rerender } = renderSync<boolean>(seed, false, false);

    expect(seed).toHaveBeenCalledWith(false);
    seed.mockClear();

    rerender({ serverValue: true, dirty: false });

    expect(seed).toHaveBeenCalledWith(true);
  });

  it("ignores server changes that arrive while dirty (user intent wins)", () => {
    const seed = vi.fn();

    const { rerender } = renderSync<boolean>(seed, false, true);

    expect(seed).not.toHaveBeenCalled();

    rerender({ serverValue: true, dirty: true });

    expect(seed).not.toHaveBeenCalled();
  });

  it("re-syncs from server as soon as dirty clears (e.g. after save or cancel)", () => {
    const seed = vi.fn();

    const { rerender } = renderSync<boolean>(seed, true, true);

    expect(seed).not.toHaveBeenCalled();

    rerender({ serverValue: true, dirty: false });

    expect(seed).toHaveBeenCalledWith(true);
  });

  it("skips a nullish serverValue (not known yet) and seeds once it arrives", () => {
    // Null means the mount-time fetch hasn't answered — not "seed a blank". The
    // caller keeps its provisional value AND its own not-yet-seeded flag, which
    // is what lets the chat's first-send gate wait for the real notation.
    const seed = vi.fn<(value: string | null) => void>();

    const { rerender } = renderSync<string | null>(seed, null, false);

    expect(seed).not.toHaveBeenCalled();

    rerender({ serverValue: "stark", dirty: false });

    expect(seed).toHaveBeenCalledWith("stark");
  });

  it("still seeds a falsy-but-present value (false is an answer, not absence)", () => {
    const seed = vi.fn();

    renderHook(() => useSyncServerSetting(false, false, seed));

    expect(seed).toHaveBeenCalledWith(false);
  });

  it("works with non-boolean values (e.g. the notation enum)", () => {
    const seed = vi.fn<(value: string) => void>();

    const { rerender } = renderSync<string>(seed, "barbeat", false);

    expect(seed).toHaveBeenCalledWith("barbeat");
    seed.mockClear();

    rerender({ serverValue: "midi-json", dirty: false });

    expect(seed).toHaveBeenCalledWith("midi-json");
  });
});
