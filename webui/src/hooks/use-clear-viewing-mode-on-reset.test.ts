// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useClearViewingModeOnReset } from "#webui/hooks/use-clear-viewing-mode-on-reset";

describe("useClearViewingModeOnReset", () => {
  it("clears when the active id transitions from set to null (delete reset)", () => {
    const clear = vi.fn();
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useClearViewingModeOnReset(id, clear),
      { initialProps: { id: "rec-1" as string | null } },
    );

    expect(clear).not.toHaveBeenCalled();

    rerender({ id: null });

    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("does not clear when opening a foreign record (null then set, or set to set)", () => {
    const clear = vi.fn();
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useClearViewingModeOnReset(id, clear),
      { initialProps: { id: null as string | null } },
    );

    rerender({ id: "rec-1" }); // open a record
    rerender({ id: "rec-2" }); // switch to another

    expect(clear).not.toHaveBeenCalled();
  });

  it("does not clear when it mounts with no active id", () => {
    const clear = vi.fn();

    renderHook(() => useClearViewingModeOnReset(null, clear));

    expect(clear).not.toHaveBeenCalled();
  });

  it("clears again on a subsequent set → null transition", () => {
    const clear = vi.fn();
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useClearViewingModeOnReset(id, clear),
      { initialProps: { id: "rec-1" as string | null } },
    );

    rerender({ id: null });
    rerender({ id: "rec-2" });
    rerender({ id: null });

    expect(clear).toHaveBeenCalledTimes(2);
  });
});
