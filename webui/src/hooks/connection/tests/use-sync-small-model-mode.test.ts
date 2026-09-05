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

/** The two values the hook syncs between. */
type SyncProps = { serverValue: boolean; activeValue: boolean | null };

/**
 * Render useSyncSmallModelMode over rerenderable props.
 * @param initialProps - The server and active values the hook starts on
 * @returns The two callback spies and the rerender that feeds new values
 */
function renderSync(initialProps: SyncProps) {
  const setLocal = vi.fn();
  const postToServer = vi.fn();
  const { rerender } = renderHook(
    ({ serverValue, activeValue }: SyncProps) =>
      useSyncSmallModelMode(serverValue, activeValue, setLocal, postToServer),
    { initialProps },
  );

  return { setLocal, postToServer, rerender };
}

describe("useSyncSmallModelMode", () => {
  it("seeds local from server on initial render when no active conversation", () => {
    const { setLocal, postToServer } = renderSync({
      serverValue: true,
      activeValue: null,
    });

    expect(setLocal).toHaveBeenCalledWith(true);
    expect(postToServer).not.toHaveBeenCalled();
  });

  it("seeds local with false from server when no active conversation", () => {
    const { setLocal } = renderSync({ serverValue: false, activeValue: null });

    expect(setLocal).toHaveBeenCalledWith(false);
  });

  it("does not seed local when there is an active conversation", () => {
    const { setLocal } = renderSync({ serverValue: true, activeValue: false });

    // setLocal should not be called from the seed effect when activeValue is non-null
    // (the ref-updating effect runs but the seed effect checks activeValueRef)
    expect(setLocal).not.toHaveBeenCalled();
  });

  it("posts to server when activeValue is non-null", () => {
    const { postToServer } = renderSync({
      serverValue: false,
      activeValue: true,
    });

    expect(postToServer).toHaveBeenCalledWith(true);
  });

  it("does not post to server when activeValue is null", () => {
    const { postToServer } = renderSync({
      serverValue: false,
      activeValue: null,
    });

    expect(postToServer).not.toHaveBeenCalled();
  });

  it("updates local when serverValue changes and no active conversation", () => {
    const { setLocal, rerender } = renderSync({
      serverValue: false,
      activeValue: null,
    });

    expect(setLocal).toHaveBeenCalledWith(false);
    setLocal.mockClear();

    rerender({ serverValue: true, activeValue: null });

    expect(setLocal).toHaveBeenCalledWith(true);
  });

  it("posts to server when activeValue changes from null to non-null", () => {
    const { postToServer, rerender } = renderSync({
      serverValue: false,
      activeValue: null,
    });

    expect(postToServer).not.toHaveBeenCalled();

    rerender({ serverValue: false, activeValue: true });

    expect(postToServer).toHaveBeenCalledWith(true);
  });
});
