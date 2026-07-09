// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CollectionEntryAutosaveParams,
  useCollectionEntryAutosave,
} from "#webui/hooks/context/use-doc-collection";

describe("useCollectionEntryAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /**
   * Render the hook with initial params and a rerender helper.
   * @param initial - Initial params
   * @returns The hook result plus rerender/unmount
   */
  function setup(initial: CollectionEntryAutosaveParams) {
    return renderHook(
      (p: CollectionEntryAutosaveParams) => useCollectionEntryAutosave(p),
      { initialProps: initial },
    );
  }

  it("idle-autosaves an existing entry after the debounce elapses", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const { rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
    });

    rerender({
      canSave: true,
      draftKey: "edited",
      autosaveOnIdle: true,
      persist,
    });
    expect(persist).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does NOT idle-autosave a new entry (would remount and drop focus)", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const { rerender } = setup({
      canSave: false,
      draftKey: "",
      autosaveOnIdle: false,
      persist,
    });

    rerender({
      canSave: true,
      draftKey: "typed",
      autosaveOnIdle: false,
      persist,
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(persist).not.toHaveBeenCalled();
  });

  it("flushes a dirty savable draft on unmount (overlay close / tab switch)", () => {
    const persist = vi.fn().mockResolvedValue(true);
    const { rerender, unmount } = setup({
      canSave: false,
      draftKey: "",
      autosaveOnIdle: false,
      persist,
    });

    rerender({
      canSave: true,
      draftKey: "typed",
      autosaveOnIdle: false,
      persist,
    });
    unmount();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("flushes on unmount even if the idle debounce hasn't fired yet", () => {
    const persist = vi.fn().mockResolvedValue(true);
    const { rerender, unmount } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
    });

    rerender({
      canSave: true,
      draftKey: "edited",
      autosaveOnIdle: true,
      persist,
    });
    // Debounce armed but not advanced; unmount must still persist exactly once.
    unmount();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not flush an unedited existing entry on unmount", () => {
    const persist = vi.fn().mockResolvedValue(true);
    const { unmount } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
    });

    unmount();

    expect(persist).not.toHaveBeenCalled();
  });

  it("does not flush when the draft is not savable", () => {
    const persist = vi.fn().mockResolvedValue(true);
    const { rerender, unmount } = setup({
      canSave: false,
      draftKey: "",
      autosaveOnIdle: false,
      persist,
    });

    rerender({
      canSave: false,
      draftKey: "partial",
      autosaveOnIdle: false,
      persist,
    });
    unmount();

    expect(persist).not.toHaveBeenCalled();
  });

  it("retries on the next change after a failed persist (baseline rolled back)", async () => {
    const persist = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const { rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
    });

    rerender({ canSave: true, draftKey: "v1", autosaveOnIdle: true, persist });
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(persist).toHaveBeenCalledTimes(1);

    rerender({ canSave: true, draftKey: "v2", autosaveOnIdle: true, persist });
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("noteSaved advances the baseline so a manual save isn't re-flushed on unmount", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const { result, rerender, unmount } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: false,
      persist,
    });

    // The editor persisted the draft out-of-band (the Save button), then syncs.
    rerender({
      canSave: true,
      draftKey: "manual",
      autosaveOnIdle: false,
      persist,
    });
    await act(() => {
      result.current.noteSaved();
    });
    unmount();

    expect(persist).not.toHaveBeenCalled();
  });

  it("flushes on beforeunload (tab close)", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const { rerender } = setup({
      canSave: false,
      draftKey: "",
      autosaveOnIdle: false,
      persist,
    });

    rerender({
      canSave: true,
      draftKey: "typed",
      autosaveOnIdle: false,
      persist,
    });
    await act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    expect(persist).toHaveBeenCalledTimes(1);
  });
});
