// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
// Write-ordering suite for useContextEditorState: only one PUT may be on the
// wire at a time, and the server must see them in the order the user triggered
// them. Split from the main behavioral file, which had reached the test-file
// line limit. Three directions, all of which have been broken at some point —
// autosave→manual, manual→manual, and manual→autosave — so each gets a block
// below and none is allowed to look like the accidental omission.
import { act } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deferredSave,
  deferredSaveQueue,
  drainMicrotasks,
  flushDebounceWindow,
  renderReadyEditor,
  startBlockedClear,
  stubConfirm,
  typeDraft,
} from "./use-context-editor-state-test-helpers";

describe("useContextEditorState write ordering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("clear vs in-flight save ordering", () => {
    it("handleClear awaits the in-flight save POST before dispatching clear's POST", async () => {
      // The in-flight save's response is held back until we explicitly resolve
      // it, simulating a slow network. handleClear must not call clear()
      // until that promise settles, otherwise the older draft's POST could
      // land at the server AFTER clear's POST and undo the clear.
      const { save, resolveSave } = deferredSave();
      const clear = vi.fn().mockResolvedValue(true);
      const { result } = renderReadyEditor({ save, clear });

      stubConfirm(true);

      // Trigger a debounced save that the test will hold in-flight.
      await typeDraft(result, "draft");
      await flushDebounceWindow();
      expect(save).toHaveBeenCalledTimes(1);
      expect(clear).not.toHaveBeenCalled();

      // Fire Clear. Promise stays pending until we resolve the save below.
      const { pending: clearPromise } = await startBlockedClear(result, clear);

      // Release the in-flight save's response; clear should then proceed.
      await act(async () => {
        resolveSave(true);
        await clearPromise;
      });
      expect(clear).toHaveBeenCalledTimes(1);
    });

    it("queues a second flush behind the first and holds handleClear until the whole chain drains", async () => {
      // Two flushes in quick succession (a debounce flush, then another before
      // the first echo lands). They no longer share the wire — the second is
      // ordered behind the first — and a Clear fired while both are
      // outstanding must wait out the ENTIRE chain: releasing only the first
      // lets the queued save go out, which clear must still be behind.
      const resolvers: Array<(saved: boolean) => void> = [];
      const save = vi
        .fn()
        .mockImplementation(
          () => new Promise<boolean>((resolve) => resolvers.push(resolve)),
        );
      const clear = vi.fn().mockResolvedValue(true);
      const { result } = renderReadyEditor({ save, clear });

      stubConfirm(true);

      await typeDraft(result, "draft one");
      await flushDebounceWindow();
      expect(save).toHaveBeenCalledTimes(1);

      await typeDraft(result, "draft two");
      await flushDebounceWindow();
      expect(save).toHaveBeenCalledTimes(1);

      const { pending: clearPromise } = await startBlockedClear(result, clear);

      // Release the first save: the queued one dispatches, clear stays blocked.
      await act(async () => {
        resolvers[0]?.(true);
      });
      await drainMicrotasks(5);
      expect(save).toHaveBeenCalledTimes(2);
      expect(save).toHaveBeenLastCalledWith("draft two");
      expect(clear).not.toHaveBeenCalled();

      await act(async () => {
        resolvers[1]?.(true);
        await clearPromise;
      });
      expect(clear).toHaveBeenCalledTimes(1);
    });

    it("is not wedged by a save that rejects instead of resolving false", async () => {
      // save() resolves false on failure today; if that ever changed, a rejected
      // promise left in the in-flight set would make every later clear/import
      // await a rejecting Promise.all.
      const save = vi.fn().mockRejectedValue(new Error("network down"));
      const clear = vi.fn().mockResolvedValue(true);
      const { result } = renderReadyEditor({ save, clear });

      stubConfirm(true);

      await typeDraft(result, "draft");
      await flushDebounceWindow(2);
      expect(save).toHaveBeenCalledTimes(1);

      await act(async () => {
        await expect(result.current.handleClear()).resolves.toBe(true);
      });
      expect(clear).toHaveBeenCalledTimes(1);
    });

    it("handleImport awaits an in-flight save before importing", async () => {
      let resolveSave: (saved: boolean) => void = () => {};
      const save = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<boolean>((resolve) => {
              resolveSave = resolve;
            }),
        )
        .mockResolvedValue(true);
      const { result } = renderReadyEditor({ save });

      stubConfirm(true);

      // Arm a debounced save and hold it in-flight.
      await typeDraft(result, "draft");
      await flushDebounceWindow();
      expect(save).toHaveBeenCalledTimes(1);

      let importPromise: Promise<void> | null = null;

      await act(() => {
        importPromise = result.current.handleImport("# imported");
      });
      // Import must be blocked on the in-flight save; its POST hasn't gone yet.
      await drainMicrotasks();
      expect(save).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveSave(true);
        await importPromise;
      });

      expect(save).toHaveBeenCalledTimes(2);
      expect(save).toHaveBeenLastCalledWith("# imported");
    });

    it("handleClear works when no save is in flight", async () => {
      const clear = vi.fn().mockResolvedValue(true);
      const { result } = renderReadyEditor({ clear });

      stubConfirm(true);

      await act(async () => {
        // Resolves true so callers (OverridePanes) collapse the reveal.
        await expect(result.current.handleClear()).resolves.toBe(true);
      });

      expect(clear).toHaveBeenCalledTimes(1);
    });

    it("handleClear is a no-op when the user cancels confirm", async () => {
      const clear = vi.fn().mockResolvedValue(true);
      const { result } = renderReadyEditor({ clear });

      stubConfirm(false);

      await act(async () => {
        // Resolves false so callers (OverridePanes) keep the reveal open.
        await expect(result.current.handleClear()).resolves.toBe(false);
      });

      expect(clear).not.toHaveBeenCalled();
    });
  });

  describe("clear vs import ordering", () => {
    // The two manual writes must be ordered against EACH OTHER, not just
    // against autosave: each registers its own POST in the in-flight set. Left
    // untracked, the second one finds an empty set and dispatches immediately,
    // putting two writes on the wire at once — the UI resolves correctly
    // (use-doc discards the superseded echo) but the file on disk keeps
    // whichever the server handled last, and the next poll surfaces it.
    it("blocks a Clear fired while the import POST is still on the wire", async () => {
      const { save, resolveSave: resolveImport } = deferredSave();
      const clear = vi.fn().mockResolvedValue(true);
      const { result } = renderReadyEditor({ save, clear });

      stubConfirm(true);

      // Never awaited inside the act: the point is to observe the state while
      // the import's POST is still pending.
      let importPromise: Promise<void> | undefined;

      await act(() => {
        importPromise = result.current.handleImport("# imported");
      });
      expect(save).toHaveBeenCalledWith("# imported");

      const { pending: clearPromise } = await startBlockedClear(result, clear);

      await act(async () => {
        resolveImport(true);
        await importPromise;
        await clearPromise;
      });
      expect(clear).toHaveBeenCalledTimes(1);
    });

    it("blocks an Import fired while the clear POST is still on the wire", async () => {
      const save = vi.fn().mockResolvedValue(true);
      const { save: clear, resolveSave: resolveClear } = deferredSave();
      const { result } = renderReadyEditor({ save, clear });

      stubConfirm(true);

      let clearPromise: Promise<boolean> | undefined;
      let importPromise: Promise<void> | undefined;

      await act(() => {
        clearPromise = result.current.handleClear();
      });
      expect(clear).toHaveBeenCalledTimes(1);

      await act(() => {
        importPromise = result.current.handleImport("# imported");
      });
      await drainMicrotasks();
      expect(save).not.toHaveBeenCalled();

      await act(async () => {
        resolveClear(true);
        await clearPromise;
        await importPromise;
      });
      expect(save).toHaveBeenCalledWith("# imported");
    });

    it("orders an Import behind a Clear that is itself still waiting on an autosave", async () => {
      // The three-way overlap, which the two-write cases above cannot reach:
      // with nothing in flight they find an empty set, so dispatch and
      // registration happen in the same turn and the ordering holds either way.
      // Here an autosave is already on the wire, so Clear has to await before it
      // can dispatch — and Clear resets the draft to "" synchronously, which
      // makes a file dropped right after it skip the import confirm and reach
      // dispatchOrderedWrite inside that await window. Registration must
      // therefore be synchronous: if Clear registered only after awaiting, the
      // Import would read the same pending set and both would hit the wire
      // together the moment the autosave landed.
      const { save, resolveCall } = deferredSaveQueue();
      const { save: clear, resolveSave: resolveClear } = deferredSave();
      const { result } = renderReadyEditor({ save, clear });

      stubConfirm(true);

      // 1. An autosave is in flight and held open.
      await typeDraft(result, "draft");
      await flushDebounceWindow();
      expect(save).toHaveBeenCalledTimes(1);

      // 2. Clear, blocked behind that autosave.
      const { pending: clearPromise } = await startBlockedClear(result, clear);

      // 3. Import while Clear is still waiting. The draft is "" by now, so this
      //    takes the no-confirm path and dispatches straight away.
      let importPromise: Promise<void> | undefined;

      await act(() => {
        importPromise = result.current.handleImport("# imported");
      });
      await drainMicrotasks();
      expect(save).toHaveBeenCalledTimes(1);

      // 4. Release the autosave. Clear may now go out; the Import may not.
      await act(async () => {
        resolveCall(0, true);
      });
      await drainMicrotasks(5);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledTimes(1);

      // 5. Release Clear. Only now does the Import reach the wire.
      await act(async () => {
        resolveClear(true);
        await clearPromise;
      });
      await drainMicrotasks(5);
      expect(save).toHaveBeenNthCalledWith(2, "# imported");

      // Settle the import's own POST so nothing is left pending on teardown.
      await act(async () => {
        resolveCall(1, true);
        await importPromise;
      });
    });

    it("does not wedge the next manual write when a clear POST rejects", async () => {
      // clear() resolves false on failure today; a rejection left in the
      // in-flight set would make every later clear/import await a rejecting
      // Promise.all, so the tracked promise must be one that settles.
      const clear = vi
        .fn()
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValue(true);
      const { result } = renderReadyEditor({ clear });

      stubConfirm(true);

      await act(async () => {
        await expect(result.current.handleClear()).resolves.toBe(false);
      });

      await act(async () => {
        await expect(result.current.handleClear()).resolves.toBe(true);
      });
      expect(clear).toHaveBeenCalledTimes(2);
    });
  });

  describe("out-of-band writes via dispatchWrite", () => {
    // The Skills "Include" toggle PUTs the same slot file the editor autosaves
    // but isn't part of the editor's save lifecycle, so it has to borrow the
    // ordering — in both directions, like every other write here.
    it("holds an out-of-band write until the in-flight autosave lands", async () => {
      // Left unordered, the smaller toggle PUT wins the race, echoes the
      // PRE-edit body, and claims the newer sequence number — so the stale body
      // is what the merge commits and what Reload then offers over the user's
      // own text.
      const { save, resolveSave } = deferredSave();
      const toggle = vi.fn().mockResolvedValue(true);
      const { result } = renderReadyEditor({ save });

      await typeDraft(result, "edited body");
      await flushDebounceWindow();
      expect(save).toHaveBeenCalledTimes(1);

      let togglePromise: Promise<boolean> | undefined;

      await act(() => {
        togglePromise = result.current.dispatchWrite(toggle);
      });
      await drainMicrotasks();
      expect(toggle).not.toHaveBeenCalled();

      await act(async () => {
        resolveSave(true);
        await togglePromise;
      });
      expect(toggle).toHaveBeenCalledTimes(1);
    });

    it("holds a blur flush until an in-flight out-of-band write lands", async () => {
      const save = vi.fn().mockResolvedValue(true);
      const { save: toggle, resolveSave: resolveToggle } = deferredSave();
      const { result } = renderReadyEditor({ save });

      let togglePromise: Promise<boolean> | undefined;

      await act(() => {
        // deferredSave's spy is typed loosely (it also stands in for the doc
        // hook's save/clear), so the write thunk needs the narrower signature.
        togglePromise = result.current.dispatchWrite(
          toggle as () => Promise<boolean>,
        );
      });
      expect(toggle).toHaveBeenCalledTimes(1);

      await typeDraft(result, "typed during toggle");
      await act(() => {
        result.current.handleBlur();
      });
      await drainMicrotasks();
      expect(save).not.toHaveBeenCalled();

      await act(async () => {
        resolveToggle(true);
        await togglePromise;
      });
      await drainMicrotasks();
      expect(save).toHaveBeenCalledWith("typed during toggle");
    });
  });

  describe("autosave vs in-flight manual write", () => {
    // The remaining direction: the editor stays live through a Clear/Import
    // round trip (it only remounts once the echo lands), so the user can type
    // into it while that PUT is on the wire. Ordering that draft behind the
    // replace only guarantees it lands LAST — writing text to disk that the
    // remount then hides, with no banner until the next poll offers it back as
    // an external edit. The replace is what the user ends up looking at, so the
    // draft is dropped instead.
    it("drops a draft typed during an in-flight Clear", async () => {
      const save = vi.fn().mockResolvedValue(true);
      const { save: clear, resolveSave: resolveClear } = deferredSave();
      const { result } = renderReadyEditor({ save, clear });

      stubConfirm(true);

      let clearPromise: Promise<boolean> | undefined;

      await act(() => {
        clearPromise = result.current.handleClear();
      });
      expect(clear).toHaveBeenCalledTimes(1);

      await typeDraft(result, "typed during clear");
      await flushDebounceWindow();
      expect(save).not.toHaveBeenCalled();

      await act(async () => {
        resolveClear(true);
        await clearPromise;
      });
      await drainMicrotasks();
      expect(save).not.toHaveBeenCalled();
      expect(result.current.getContent()).toBe("");
    });

    it("drops a blur flush typed during an in-flight Import", async () => {
      // Blur flushes with no debounce, so the window is the bare round trip —
      // the race is not only the 800ms one.
      let resolveImport: (saved: boolean) => void = () => {};
      const save = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<boolean>((resolve) => {
              resolveImport = resolve;
            }),
        )
        .mockResolvedValue(true);
      const { result } = renderReadyEditor({ save });

      stubConfirm(true);

      let importPromise: Promise<void> | undefined;

      await act(() => {
        importPromise = result.current.handleImport("# imported");
      });
      expect(save).toHaveBeenCalledTimes(1);

      await typeDraft(result, "typed during import");
      await act(() => {
        result.current.handleBlur();
      });
      await drainMicrotasks();
      expect(save).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveImport(true);
        await importPromise;
      });
      await drainMicrotasks();
      expect(save).toHaveBeenCalledTimes(1);
      expect(result.current.getContent()).toBe("# imported");
    });

    it("autosaves again normally once the Clear has landed", async () => {
      // The drop lasts only as long as the replace is on the wire.
      const save = vi.fn().mockResolvedValue(true);
      const { save: clear, resolveSave: resolveClear } = deferredSave();
      const { result } = renderReadyEditor({ save, clear });

      stubConfirm(true);

      let clearPromise: Promise<boolean> | undefined;

      await act(() => {
        clearPromise = result.current.handleClear();
      });
      await act(async () => {
        resolveClear(true);
        await clearPromise;
      });
      await drainMicrotasks();

      await typeDraft(result, "typed after clear");
      await flushDebounceWindow();
      await drainMicrotasks();

      expect(save).toHaveBeenCalledWith("typed after clear");
    });
  });
});
