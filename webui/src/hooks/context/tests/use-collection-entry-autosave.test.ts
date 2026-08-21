// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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

/**
 * Mount as an empty new entry, then rerender to a typed, savable draft with
 * idle-autosave off — the arrangement the flush tests share before dispatching.
 * @param persist - The persist spy threaded through both renders
 * @returns The rendered hook (rerender/unmount/result)
 */
function setupDraft(persist: CollectionEntryAutosaveParams["persist"]) {
  const rendered = setup({
    canSave: false,
    draftKey: "",
    autosaveOnIdle: false,
    persist,
  });

  rendered.rerender({
    canSave: true,
    draftKey: "typed",
    autosaveOnIdle: false,
    persist,
  });

  return rendered;
}

/**
 * Mount an existing entry that also carries an externalKey — the starting point
 * for the "deleted out from under the editor" tests.
 * @param persist - The persist spy for the render
 * @returns The rendered hook (rerender/unmount/result)
 */
function setupSeedExternal(persist: CollectionEntryAutosaveParams["persist"]) {
  return setup({
    canSave: true,
    draftKey: "seed",
    autosaveOnIdle: true,
    persist,
    externalKey: "seed",
  });
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

    setupDraft(persist);

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(persist).not.toHaveBeenCalled();
  });

  it("flushes a dirty savable draft on unmount (overlay close / tab switch)", () => {
    const persist = vi.fn().mockResolvedValue("typed");
    const { unmount } = setupDraft(persist);

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
    const { rerender, unmount } = setupSeedExternal(persist);

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
    const { rerender } = setupSeedExternal(persist);

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
    const { rerender, unmount } = setupSeedExternal(persist);

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

    setupDraft(persist);

    await act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("chains an overlapping flush behind the PUT already on the wire", async () => {
    // An entry PUT carries the whole body, so two concurrent writes aren't a
    // field-level overlap: a slow first PUT landing second reverts the newer
    // content, and use-doc's generation counter keeps the SCREEN right, so the
    // file silently disagrees with it until the next poll.
    const { persist, resolvers } = deferredPersist();
    const { rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
    });

    await typeAndDebounce(rerender, persist, "v1");
    expect(persist).toHaveBeenCalledTimes(1);

    // The user types again while #1 is still in flight and the re-armed debounce
    // fires. The changed draft passes the same-key guard, so only the chaining
    // holds it back.
    await typeAndDebounce(rerender, persist, "v2");
    expect(persist).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]?.("v1");
      await flushMicrotasks();
    });

    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("still flushes on unmount while a PUT is on the wire", async () => {
    // The editors used to fold "a save is in flight" into canSave, which made
    // this flush bail out — so every edit typed during a save's round trip was
    // dropped when the overlay closed before that save landed.
    const { persist, resolvers } = deferredPersist();
    const { rerender, unmount } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
    });

    await typeAndDebounce(rerender, persist, "v1");
    expect(persist).toHaveBeenCalledTimes(1);

    // One more edit, then close the overlay before v1's PUT comes back.
    rerender({ canSave: true, draftKey: "v2", autosaveOnIdle: true, persist });
    unmount();

    await act(async () => {
      resolvers[0]?.("v1");
      await flushMicrotasks();
    });

    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("queues a third flush behind the second (registration is synchronous)", async () => {
    // Registering the new promise before any await is the load-bearing half: if
    // flush awaited first and registered afterwards, a second and third flush in
    // the same window would both read a pre-registration inFlightRef, compute the
    // same predecessor, and put two writes on the wire when it settles.
    const { persist, resolvers } = deferredPersist();
    const { rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
    });

    await typeAndDebounce(rerender, persist, "v1");
    await typeAndDebounce(rerender, persist, "v2");
    await typeAndDebounce(rerender, persist, "v3");
    expect(persist).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]?.("v1");
      await flushMicrotasks();
    });
    expect(persist).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvers[1]?.("v2");
      await flushMicrotasks();
    });
    expect(persist).toHaveBeenCalledTimes(3);
  });

  it("keeps autosaving, and lets a rename settle, after a persist rejects", async () => {
    // persist resolves null on failure today. A rejection would leave the
    // rejected promise parked in inFlightRef with nothing to null it: every
    // later flush would chain off it and never dispatch (autosave silently dead
    // for the rest of the mount), and settlePendingSave would throw into
    // commitRename's un-awaited call, breaking renames too.
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue("v2");
    const { result, rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
    });

    await typeAndDebounce(rerender, persist, "v1");
    expect(persist).toHaveBeenCalledTimes(1);
    await act(async () => {
      await flushMicrotasks();
    });

    await typeAndDebounce(rerender, persist, "v2");
    expect(persist).toHaveBeenCalledTimes(2);

    await act(async () => {
      await expect(result.current.settlePendingSave()).resolves.toBeUndefined();
    });
  });

  it("does not dispatch a queued flush for an entry deleted while it waited", async () => {
    // The queued flush was authorized before the delete, so it has to re-check
    // at dispatch time — otherwise chaining reopens the resurrection hole the
    // synchronous guard closes.
    const { persist, resolvers } = deferredPersist();
    const { rerender } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
      externalKey: "seed",
    });

    await typeAndDebounce(rerender, persist, "v1", "seed");
    await typeAndDebounce(rerender, persist, "v2", "seed");
    expect(persist).toHaveBeenCalledTimes(1);

    // The entry is deleted out from under the editor while #1 is in flight.
    rerender({
      canSave: true,
      draftKey: "v2",
      autosaveOnIdle: true,
      persist,
    });

    await act(async () => {
      resolvers[0]?.("v1");
      await flushMicrotasks();
    });

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not flush on unmount while a rename is on the wire", async () => {
    // Regression: the unmount and tab-close flushes fire without an arming
    // render, so the arming effect's hold never saw them. Every slug such a
    // flush can name is the one the rename is leaving, so it re-created the
    // entry under the old name — a duplicate holding the same content. What the
    // rename didn't carry is covered by resumePendingSave, below.
    const persist = vi.fn().mockResolvedValue(null);
    const { result, rerender, unmount } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
    });

    rerender({ canSave: true, draftKey: "v1", autosaveOnIdle: true, persist });

    await act(async () => {
      await result.current.settlePendingSave();
    });

    unmount();

    expect(persist).not.toHaveBeenCalled();
  });

  it("does not re-arm autosave for an editor that unmounted mid-rename", async () => {
    // resumePendingSave runs from the rename's own continuation, which the
    // unmount can't cancel — so it fired for a gone editor and armed a flush no
    // cleanup would clear, writing the draft back to the slug the rename left.
    // It reports the bail instead: the hold also swallowed the unmount flush,
    // so this dirty draft reaches disk only if the caller writes it.
    const persist = vi.fn().mockResolvedValue(null);
    const { result, rerender, unmount } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      persist,
    });

    rerender({ canSave: true, draftKey: "v1", autosaveOnIdle: true, persist });

    await act(async () => {
      await result.current.settlePendingSave();
    });

    unmount();

    let resumed: boolean | null = null;

    await act(async () => {
      resumed = result.current.resumePendingSave();
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(resumed).toBe(false);

    expect(persist).not.toHaveBeenCalled();
  });

  it("leaves an already-armed debounce alone when a rename resumes", async () => {
    // A timer already on the clock means the arming effect beat resume to it.
    // Arming a second one leaves the first orphaned — only the ref'd timer is
    // ever cleared, so the stray one outlives the editor and saves a draft the
    // user closed without saving.
    const persist = vi.fn().mockResolvedValue(null);
    // flushOnLeave off so the unmount flush doesn't hide the stray timer.
    const { result, rerender, unmount } = setup({
      canSave: true,
      draftKey: "seed",
      autosaveOnIdle: true,
      flushOnLeave: false,
      persist,
    });

    rerender({
      canSave: true,
      draftKey: "v1",
      autosaveOnIdle: true,
      flushOnLeave: false,
      persist,
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      // Still mounted: the draft is on the clock either way, armed here or by
      // the effect, so the caller has nothing left to write.
      expect(result.current.resumePendingSave()).toBe(true);
      await Promise.resolve();
    });

    // Unmount cancels the debounce this editor armed — all of it.
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(persist).not.toHaveBeenCalled();
  });
});

/**
 * A persist spy whose calls resolve only when the test releases them, in call
 * order — the slow-PUT window every chaining case needs.
 * @returns The spy and the resolver for each outstanding call
 */
function deferredPersist(): {
  persist: Mock<() => Promise<string | null>>;
  resolvers: Array<(echoKey: string | null) => void>;
} {
  const resolvers: Array<(echoKey: string | null) => void> = [];
  const persist = vi.fn(
    () =>
      new Promise<string | null>((resolve) => {
        resolvers.push(resolve);
      }),
  );

  return { persist, resolvers };
}

/** Settle the promise chain a released persist unblocks. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

/**
 * Type a new draft and let the idle debounce fire, the way an editing user
 * reaches flush.
 * @param rerender - The rendered hook's rerender
 * @param persist - The persist spy threaded through every render
 * @param draftKey - The draft the user has typed to
 * @param externalKey - The live entry prop's key, when the case tracks one
 */
async function typeAndDebounce(
  rerender: (params: CollectionEntryAutosaveParams) => void,
  persist: CollectionEntryAutosaveParams["persist"],
  draftKey: string,
  externalKey?: string,
): Promise<void> {
  rerender({
    canSave: true,
    draftKey,
    autosaveOnIdle: true,
    persist,
    externalKey,
  });
  await act(async () => {
    vi.advanceTimersByTime(800);
    await Promise.resolve();
  });
}

/**
 * The seeded, savable, idle-autosaving params the externalUpdate cases start
 * from — each case overrides only the key(s) it is pinning.
 * @param overrides - Fields this case diverges on
 * @returns Params for setup()/rerender()
 */
function seededParams(
  overrides: Partial<CollectionEntryAutosaveParams> = {},
): CollectionEntryAutosaveParams {
  return {
    canSave: true,
    draftKey: "seed",
    autosaveOnIdle: true,
    persist: vi.fn().mockResolvedValue("seed"),
    externalKey: "seed",
    ...overrides,
  };
}

describe("useCollectionEntryAutosave — externalUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is false while the entry prop matches the baseline", () => {
    const { result } = setup(seededParams());

    expect(result.current.externalUpdate).toBe(false);
  });

  it("is true when the draft is clean and the entry prop diverges (an assistant write, or another tab)", () => {
    const { result, rerender } = setup(seededParams());

    // The entry prop changed externally; the local draft did not.
    rerender(seededParams({ externalKey: "changed-elsewhere" }));

    expect(result.current.externalUpdate).toBe(true);
  });

  it("is false when the draft is dirty, even if the entry prop diverges (last-write-wins)", () => {
    const { result, rerender } = setup(seededParams());

    // The user typed (draftKey moves off the baseline) in the same tick the
    // entry prop diverges — the dirty draft must suppress the banner.
    rerender(
      seededParams({
        draftKey: "typed-by-user",
        externalKey: "changed-elsewhere",
      }),
    );

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
