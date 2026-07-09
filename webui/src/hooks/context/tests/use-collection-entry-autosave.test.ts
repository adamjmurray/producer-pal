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

/**
 * Render the hook with initial params and a rerender helper. Shared by both
 * describe blocks below (autosave lifecycle, external-update detection).
 * @param initial - Initial params
 * @returns The hook result plus rerender/unmount
 */
function setup(initial: CollectionEntryAutosaveParams) {
  return renderHook(
    (p: CollectionEntryAutosaveParams) => useCollectionEntryAutosave(p),
    { initialProps: initial },
  );
}

describe("useCollectionEntryAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("idle-autosaves an existing entry after the debounce elapses", async () => {
    const persist = vi.fn().mockResolvedValue("edited");
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
    const persist = vi.fn().mockResolvedValue("typed");
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
    const persist = vi.fn().mockResolvedValue("typed");
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
    const persist = vi.fn().mockResolvedValue("edited");
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
    const persist = vi.fn().mockResolvedValue("seed");
    const { unmount } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
    });

    unmount();

    expect(persist).not.toHaveBeenCalled();
  });

  it("does NOT flush on unmount after the entry was deleted externally (Discard must not resurrect it)", () => {
    const persist = vi.fn().mockResolvedValue("typed");
    const { rerender, unmount } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
      externalKey: "seed",
    });

    // The user edits, then the entry is deleted out from under the editor
    // (entry prop goes null, so externalKey becomes undefined and the editor
    // flips to new-entry mode). Discard's selection change unmounts the
    // editor — the flush must not re-create the entry from the kept draft.
    rerender({
      canSave: true,
      draftKey: "typed",
      autosaveOnIdle: false,
      persist,
      externalKey: "seed",
    });
    rerender({
      canSave: true,
      draftKey: "typed",
      autosaveOnIdle: false,
      persist,
    });
    unmount();

    expect(persist).not.toHaveBeenCalled();
  });

  it("does NOT flush on beforeunload after the entry was deleted externally", async () => {
    const persist = vi.fn().mockResolvedValue("typed");
    const { rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
      externalKey: "seed",
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

    expect(persist).not.toHaveBeenCalled();
  });

  it("flushes again when the deleted entry reappears (deletion state is not sticky)", () => {
    const persist = vi.fn().mockResolvedValue("typed");
    const { rerender, unmount } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
      externalKey: "seed",
    });

    // Deleted externally, then restored (e.g. re-created elsewhere and picked
    // up by a poll) — the normal unmount flush applies again.
    rerender({
      canSave: true,
      draftKey: "typed",
      autosaveOnIdle: false,
      persist,
    });
    rerender({
      canSave: true,
      draftKey: "typed",
      autosaveOnIdle: true,
      persist,
      externalKey: "seed",
    });
    unmount();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not flush when the draft is not savable", () => {
    const persist = vi.fn().mockResolvedValue("partial");
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
    const persist = vi.fn().mockResolvedValueOnce(null).mockResolvedValue("v2");
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
    const persist = vi.fn().mockResolvedValue("manual");
    const { result, rerender, unmount } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: false,
      persist,
    });

    // The editor persisted the draft out-of-band (the Save button), then syncs
    // the baseline from the save's echo (not the sent draft — see the
    // externalUpdate describe block below for why that distinction matters).
    rerender({
      canSave: true,
      draftKey: "manual",
      autosaveOnIdle: false,
      persist,
    });
    await act(() => {
      result.current.noteSaved("manual");
    });
    unmount();

    expect(persist).not.toHaveBeenCalled();
  });

  it("flushes on beforeunload (tab close)", async () => {
    const persist = vi.fn().mockResolvedValue("typed");
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

describe("useCollectionEntryAutosave — externalUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is false while the entry prop matches the baseline", () => {
    const { result } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist: vi.fn().mockResolvedValue("seed"),
      externalKey: "seed",
    });

    expect(result.current.externalUpdate).toBe(false);
  });

  it("is true when the draft is clean and the entry prop diverges (an assistant write, or another tab)", () => {
    const { result, rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist: vi.fn().mockResolvedValue("seed"),
      externalKey: "seed",
    });

    // The entry prop changed externally; the local draft did not.
    rerender({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist: vi.fn().mockResolvedValue("seed"),
      externalKey: "changed-elsewhere",
    });

    expect(result.current.externalUpdate).toBe(true);
  });

  it("is false when the draft is dirty, even if the entry prop diverges (last-write-wins)", () => {
    const { result, rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist: vi.fn().mockResolvedValue("seed"),
      externalKey: "seed",
    });

    // The user typed (draftKey moves off the baseline) in the same tick the
    // entry prop diverges — the dirty draft must suppress the banner.
    rerender({
      canSave: true,
      draftKey: "typed-by-user",
      autosaveOnIdle: true,
      persist: vi.fn().mockResolvedValue("seed"),
      externalKey: "changed-elsewhere",
    });

    expect(result.current.externalUpdate).toBe(false);
  });

  it("stays false after our own save echo, even when the echo differs from the sent draft", async () => {
    // Simulates server-side normalization (slugified name, trimmed body): the
    // persist resolves an echo key that differs from the draftKey that was
    // sent, and the entry prop then updates to match that echo.
    const persist = vi.fn().mockResolvedValue("normalized-echo");
    const { result, rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
      externalKey: "seed",
    });

    rerender({
      canSave: true,
      draftKey: "raw-typed",
      autosaveOnIdle: true,
      persist,
      externalKey: "seed",
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });

    // The entry prop updates to the server's echo (mergeEntry in the parent).
    rerender({
      canSave: true,
      draftKey: "raw-typed",
      autosaveOnIdle: true,
      persist,
      externalKey: "normalized-echo",
    });

    expect(result.current.externalUpdate).toBe(false);
  });

  it("is always false in new-entry mode (no externalKey)", () => {
    const { result, rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: false,
      persist: vi.fn().mockResolvedValue("seed"),
    });

    rerender({
      canSave: true,
      draftKey: "still-typing",
      autosaveOnIdle: false,
      persist: vi.fn().mockResolvedValue("seed"),
    });

    expect(result.current.externalUpdate).toBe(false);
  });

  it("adoptExternal resets externalUpdate and does not re-arm the idle autosave", async () => {
    const persist = vi.fn().mockResolvedValue("seed");
    const { result, rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
      externalKey: "seed",
    });

    rerender({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
      externalKey: "changed-elsewhere",
    });
    expect(result.current.externalUpdate).toBe(true);

    // The Reload handler re-seeds the local draft to match the external
    // content, then calls adoptExternal — mirroring the editor's handleReload.
    rerender({
      canSave: true,
      draftKey: "changed-elsewhere",
      autosaveOnIdle: true,
      persist,
      externalKey: "changed-elsewhere",
    });
    await act(() => {
      result.current.adoptExternal();
    });

    expect(result.current.externalUpdate).toBe(false);

    // The re-seed must not have armed a redundant autosave PUT: the baseline
    // now matches the (re-seeded) draft, so idle-debounce should no-op.
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });
    expect(persist).not.toHaveBeenCalled();
  });
});
