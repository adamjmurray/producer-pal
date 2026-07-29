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

  describe("autosave vs in-flight manual write ordering", () => {
    // The remaining direction: the editor stays live through a Clear/Import
    // round trip (it only remounts once the echo lands), so the user can type
    // into it while that PUT is on the wire. An autosave that dispatched
    // immediately would race it — and the damaging outcome is the quiet one:
    // the autosave handled first, the clear landing last, the draft gone from
    // disk while the editor still shows it saved, until a poll surfaces the
    // emptiness as an "updated outside the editor" banner.
    it("holds a debounced autosave until an in-flight Clear's POST lands", async () => {
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
      expect(save).toHaveBeenCalledWith("typed during clear");
    });

    it("holds a blur flush until an in-flight Import's POST lands", async () => {
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
      expect(save).toHaveBeenCalledTimes(2);
      expect(save).toHaveBeenLastCalledWith("typed during import");
    });

    it("still rolls back and schedules the retry when a held-back autosave fails", async () => {
      // Deferring the dispatch must not cost the flush its failure handling:
      // the rollback and the SAVE_RETRY_MS timer hang off the settled promise,
      // not off when the PUT left.
      const save = vi.fn().mockResolvedValue(false);
      const { save: clear, resolveSave: resolveClear } = deferredSave();
      const { result } = renderReadyEditor({ save, clear });

      stubConfirm(true);

      let clearPromise: Promise<boolean> | undefined;

      await act(() => {
        clearPromise = result.current.handleClear();
      });

      await typeDraft(result, "typed during clear");
      await flushDebounceWindow();
      expect(save).not.toHaveBeenCalled();

      await act(async () => {
        resolveClear(true);
        await clearPromise;
      });
      await drainMicrotasks();
      expect(save).toHaveBeenCalledTimes(1);

      // The failed save armed the unattended retry, which re-POSTs the draft.
      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });
      expect(save).toHaveBeenCalledTimes(2);
      expect(save).toHaveBeenLastCalledWith("typed during clear");
    });
  });
});
