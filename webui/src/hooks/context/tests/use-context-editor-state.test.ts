// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContextEditorState } from "#webui/hooks/context/use-context-editor-state";
import {
  type DocMemoryStatus,
  type SaveStatus,
  type UseDocMemoryReturn,
} from "#webui/hooks/context/use-doc-memory";

interface MemoryOverrides {
  status?: DocMemoryStatus;
  saveStatus?: SaveStatus;
  save?: ReturnType<typeof vi.fn>;
  clear?: ReturnType<typeof vi.fn>;
}

/**
 * Build a `UseDocMemoryReturn` for testing. Defaults to a ready memory
 * with empty content and resolved save/clear stubs; pass overrides to vary.
 * @param overrides - Field overrides
 * @returns A memory-hook return value plus the spies used to assert
 */
function makeMemory(overrides: MemoryOverrides = {}): UseDocMemoryReturn {
  // vi.fn() is typed broadly enough that .mockResolvedValue() returns a
  // generic Mock that doesn't satisfy the precise signatures on the hook
  // return type; cast each one to the field's expected shape.
  return {
    status: overrides.status ?? { kind: "ready", content: "" },
    saveStatus: overrides.saveStatus ?? "idle",
    saveError: null,
    save: (overrides.save ??
      vi.fn().mockResolvedValue(true)) as UseDocMemoryReturn["save"],
    clear: (overrides.clear ??
      vi.fn().mockResolvedValue(true)) as UseDocMemoryReturn["clear"],
    refresh: vi
      .fn()
      .mockResolvedValue(undefined) as unknown as UseDocMemoryReturn["refresh"],
  };
}

function renderEditor(memory: UseDocMemoryReturn) {
  const { result, rerender, unmount } = renderHook(
    ({ memory: m }) =>
      useContextEditorState(
        m,
        "Clear all project memory? This cannot be undone.",
      ),
    { initialProps: { memory } },
  );

  return {
    result,
    unmount,
    setMemory: (next: UseDocMemoryReturn) => rerender({ memory: next }),
  };
}

const makeReady = (content: string): UseDocMemoryReturn =>
  makeMemory({ status: { kind: "ready", content } });

/**
 * Render the editor over a ready memory (content "old") with the given spy
 * overrides — the starting point most edit/save/clear tests share.
 * @param overrides - Extra memory fields (save/clear spies, saveStatus, …)
 * @returns The rendered editor (result/setMemory/unmount)
 */
function renderReadyEditor(overrides: MemoryOverrides = {}) {
  return renderEditor(
    makeMemory({ status: { kind: "ready", content: "old" }, ...overrides }),
  );
}

/**
 * A save spy that stays pending until the test resolves it, so a test can
 * assert the intermediate saving state before the write settles.
 * @returns The save spy and a trigger to resolve the pending save
 */
function deferredSave(): {
  save: ReturnType<typeof vi.fn>;
  resolveSave: (saved: boolean) => void;
} {
  let resolve: (saved: boolean) => void = () => {};
  const save = vi.fn().mockImplementation(
    () =>
      new Promise<boolean>((r) => {
        resolve = r;
      }),
  );

  return { save, resolveSave: (saved) => resolve(saved) };
}

type RenderedEditor = ReturnType<typeof renderEditor>;

/**
 * Drive a memory through an error → ready recovery: the status flips to error
 * (the editor unmounts in the real UI), then the server's content comes back.
 * @param setMemory - The rendered editor's memory setter
 * @param save - The save spy carried across both status transitions
 * @param recoveredContent - The server content the memory recovers with
 */
function recoverThroughError(
  setMemory: RenderedEditor["setMemory"],
  save: ReturnType<typeof vi.fn>,
  recoveredContent: string,
): void {
  setMemory(makeMemory({ status: { kind: "error", message: "boom" }, save }));
  setMemory(
    makeMemory({ status: { kind: "ready", content: recoveredContent }, save }),
  );
}

/**
 * Type into the editor draft without advancing any timers, leaving the
 * debounced save armed but unfired.
 * @param result - The rendered hook's result handle
 * @param value - The draft text to type
 */
async function typeDraft(
  result: RenderedEditor["result"],
  value: string,
): Promise<void> {
  await act(() => {
    result.current.handleChange(value);
  });
}

/**
 * Advance past the 800ms debounce window so the pending save dispatches, then
 * let its promise settle.
 * @param microtaskTurns - How many microtask turns to drain after the timer
 */
async function flushDebounceWindow(microtaskTurns = 1): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(800);
    for (let i = 0; i < microtaskTurns; i++) await Promise.resolve();
  });
}

/**
 * Drain microtask turns so any awaited continuations run, without advancing
 * timers — used to prove a handler is still blocked on an in-flight save.
 * @param turns - How many microtask turns to drain
 */
async function drainMicrotasks(turns = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < turns; i++) await Promise.resolve();
  });
}

/**
 * Stub `window.confirm` to return the given answer.
 * @param answer - What confirm() should return (accept vs cancel)
 * @returns The confirm spy, for asserting whether/how it was called
 */
function stubConfirm(answer: boolean): ReturnType<typeof vi.fn> {
  const confirm = vi.fn().mockReturnValue(answer);

  vi.stubGlobal("confirm", confirm);

  return confirm;
}

describe("useContextEditorState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("error → ready recovery", () => {
    it("nulls draft markers on transition to error so beforeunload doesn't flush a stale pre-error draft over the server's recovered content", async () => {
      // Pre-error: server "old", user typed "draft" but the debounced save
      // never fired (timer cleared on status change in real life). Refs end
      // up as draftRef="draft", lastSavedRef="old".
      const save = vi.fn().mockResolvedValue(true);
      const { result, setMemory } = renderReadyEditor({ save });

      // User types — populates draftRef. Don't advance the debounce timer.
      await typeDraft(result, "draft");

      // Status flips to error (the editor unmounts in the real UI, and refs
      // should be nulled by the new effect), then the server externally moves
      // to "fresh" and status recovers to ready.
      recoverThroughError(setMemory, save, "fresh");

      // beforeunload fires. With the fix, the seed effect re-ran on recovery
      // (refs were null) so draftRef=lastSavedRef="fresh" and flushSave bails
      // (value === lastSavedRef). No stale save dispatches.
      await act(() => {
        window.dispatchEvent(new Event("beforeunload"));
      });

      expect(save).not.toHaveBeenCalled();
    });

    it("still allows a fresh save after error → ready when the user makes new edits", async () => {
      const save = vi.fn().mockResolvedValue(true);
      const { result, setMemory } = renderReadyEditor({ save });

      recoverThroughError(setMemory, save, "fresh");

      await typeDraft(result, "post-recovery edit");
      await flushDebounceWindow();

      expect(save).toHaveBeenCalledWith("post-recovery edit");
    });
  });

  describe("external-update detection", () => {
    it("does NOT surface the banner when the user has an in-progress draft", async () => {
      const { result, setMemory } = renderEditor(makeReady("old"));

      await act(() => {
        result.current.handleChange("typing");
      });

      setMemory(makeReady("from-ai"));

      expect(result.current.externalUpdate).toBe(false);
    });

    it("surfaces the banner when server content changes while the draft is clean", async () => {
      const { result, setMemory } = renderEditor(makeReady("old"));

      // Mount-time seed: draftRef=lastSavedRef="old". No typing.
      expect(result.current.externalUpdate).toBe(false);

      // Server-side write lands via the focus refresh → status updates.
      setMemory(makeReady("from-ai"));

      expect(result.current.externalUpdate).toBe(true);
    });

    it("hides the banner on the user's first keystroke (last-write-wins)", async () => {
      const { result, setMemory } = renderEditor(makeReady("old"));

      setMemory(makeReady("from-ai"));
      expect(result.current.externalUpdate).toBe(true);

      await act(() => {
        result.current.handleChange("user override");
      });

      expect(result.current.externalUpdate).toBe(false);
    });

    it("handleReload adopts the server's content as the new baseline and remounts the editor", async () => {
      const { result, setMemory } = renderEditor(makeReady("old"));
      const startingKey = result.current.editorKey;

      setMemory(makeReady("from-ai"));
      expect(result.current.externalUpdate).toBe(true);

      await act(() => {
        result.current.handleReload();
      });

      // Banner dismissed and editorKey bumped to force a remount that re-seeds
      // from the server's content.
      expect(result.current.externalUpdate).toBe(false);
      expect(result.current.editorKey).toBe(startingKey + 1);
    });

    it("does NOT surface the banner when the server echoes a whitespace-normalized (trimmed) copy of our own save", async () => {
      // Regression: the Node-side stores trim on save, so forking a built-in
      // that ends in a newline (Customize) records an untrimmed baseline while
      // the save echo comes back trimmed. That must not read as an external
      // write — the first Customize used to flash a spurious Reload banner.
      const save = vi.fn().mockResolvedValue(true);
      const { result, setMemory } = renderEditor(makeMemory({ save }));

      // Customize forks the built-in (trailing newline) as the baseline.
      await act(async () => {
        await result.current.handleImport("BUILT-IN DEFAULT\n");
      });
      expect(save).toHaveBeenCalledWith("BUILT-IN DEFAULT\n");

      // The server echoes the trimmed override back through status.content.
      setMemory(makeReady("BUILT-IN DEFAULT"));

      expect(result.current.externalUpdate).toBe(false);
    });

    it("clears the banner when the server content matches the editor baseline again", async () => {
      const { result, setMemory } = renderEditor(makeReady("old"));

      setMemory(makeReady("from-ai"));
      expect(result.current.externalUpdate).toBe(true);

      // External writer reverts to the baseline (or the editor was reseeded
      // out-of-band): the banner should drop.
      setMemory(makeReady("old"));
      expect(result.current.externalUpdate).toBe(false);
    });
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
      let clearPromise: Promise<boolean> | null = null;

      await act(() => {
        clearPromise = result.current.handleClear();
      });
      // Allow microtasks to run; clear must still be blocked on the in-flight save.
      await drainMicrotasks();
      expect(clear).not.toHaveBeenCalled();

      // Release the in-flight save's response; clear should then proceed.
      await act(async () => {
        resolveSave(true);
        await clearPromise;
      });
      expect(clear).toHaveBeenCalledTimes(1);
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

  describe("dirty flag", () => {
    it("starts false, flips true on edit, flips false after a successful save", async () => {
      const save = vi.fn().mockResolvedValue(true);
      const { result } = renderReadyEditor({ save });

      expect(result.current.dirty).toBe(false);

      await typeDraft(result, "typed");
      expect(result.current.dirty).toBe(true);

      await flushDebounceWindow(2);

      expect(result.current.dirty).toBe(false);
    });

    it("stays true when the user keeps typing during an in-flight save", async () => {
      // The save() promise is held until we explicitly resolve it. During the
      // in-flight save, the user types more — draftRef advances past the
      // value being saved, so the save's resolution must NOT clear dirty.
      const { save, resolveSave } = deferredSave();
      const { result } = renderReadyEditor({ save });

      await typeDraft(result, "first");
      await flushDebounceWindow();
      expect(result.current.dirty).toBe(true);

      // User types more before the save responds.
      await typeDraft(result, "second");

      // Save of "first" resolves. draftRef="second" != lastSavedRef="first",
      // so dirty must stay true.
      await act(async () => {
        resolveSave(true);
        for (let i = 0; i < 3; i++) await Promise.resolve();
      });

      expect(result.current.dirty).toBe(true);
    });

    it("clears on Reload", async () => {
      const { result, setMemory } = renderEditor(makeReady("old"));

      await act(() => {
        result.current.handleChange("typed");
      });
      // Server externally changes; banner appears (clean-draft path requires
      // draftRef===lastSavedRef, but here it doesn't — so simulate the clean
      // path by reverting the draft first).
      await act(() => {
        result.current.handleChange("old");
      });
      expect(result.current.dirty).toBe(false);

      setMemory(makeReady("from-ai"));
      // Make the draft dirty again, then Reload should drop it.
      await act(() => {
        result.current.handleChange("typed-again");
      });
      expect(result.current.dirty).toBe(true);

      await act(() => {
        result.current.handleReload();
      });
      expect(result.current.dirty).toBe(false);
    });
  });

  describe("hasOverride latch", () => {
    it("seeds true when the slot has stored content, false when empty", () => {
      expect(renderEditor(makeReady("stored")).result.current.hasOverride).toBe(
        true,
      );
      expect(renderEditor(makeReady("")).result.current.hasOverride).toBe(
        false,
      );
    });

    it("stays true when the override is edited down to empty (latched, not derived)", async () => {
      const { result } = renderEditor(makeReady("stored"));

      expect(result.current.hasOverride).toBe(true);

      await act(() => {
        result.current.handleChange("");
      });

      // Editing to empty must NOT collapse the editable pane — hasOverride holds.
      expect(result.current.hasOverride).toBe(true);
    });

    it("flips false after a successful Clear (revert to the built-in view)", async () => {
      stubConfirm(true);
      const { result } = renderEditor(makeReady("stored"));

      await act(async () => {
        await result.current.handleClear();
      });

      expect(result.current.hasOverride).toBe(false);
    });

    it("flips true after Customize/import forks the built-in", async () => {
      const { result } = renderEditor(makeReady(""));

      expect(result.current.hasOverride).toBe(false);

      await act(async () => {
        await result.current.handleImport("BUILT-IN DEFAULT");
      });

      expect(result.current.hasOverride).toBe(true);
    });

    it("reflects the adopted content on Reload (external clear ⇒ built-in view)", async () => {
      const { result, setMemory } = renderEditor(makeReady("stored"));

      expect(result.current.hasOverride).toBe(true);

      // An external clear lands (server content now ""); the user Reloads.
      setMemory(makeReady(""));
      await act(() => {
        result.current.handleReload();
      });

      expect(result.current.hasOverride).toBe(false);
    });
  });

  describe("import", () => {
    it("imports into an empty editor without confirming, saves, and remounts", async () => {
      const save = vi.fn().mockResolvedValue(true);
      const confirm = stubConfirm(true);
      const { result } = renderEditor(makeMemory({ save }));
      const startingKey = result.current.editorKey;

      await act(async () => {
        await result.current.handleImport("# imported");
      });

      expect(confirm).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalledWith("# imported");
      expect(result.current.editorKey).toBe(startingKey + 1);
      expect(result.current.charCount).toBe("# imported".length);
      expect(result.current.dirty).toBe(false);
    });

    it("confirms before overwriting non-empty content and imports on accept", async () => {
      const save = vi.fn().mockResolvedValue(true);
      const confirm = stubConfirm(true);
      const { result } = renderEditor(
        makeMemory({ status: { kind: "ready", content: "existing" }, save }),
      );

      await act(async () => {
        await result.current.handleImport("replacement");
      });

      expect(confirm).toHaveBeenCalledOnce();
      expect(save).toHaveBeenCalledWith("replacement");
    });

    it("is a no-op when the user cancels the overwrite confirm", async () => {
      const save = vi.fn().mockResolvedValue(true);

      stubConfirm(false);
      const { result } = renderEditor(
        makeMemory({ status: { kind: "ready", content: "existing" }, save }),
      );
      const startingKey = result.current.editorKey;

      await act(async () => {
        await result.current.handleImport("replacement");
      });

      expect(save).not.toHaveBeenCalled();
      expect(result.current.editorKey).toBe(startingKey);
    });

    it("does not remount when the import save fails", async () => {
      const save = vi.fn().mockResolvedValue(false);

      const { result } = renderEditor(makeMemory({ save }));
      const startingKey = result.current.editorKey;

      await act(async () => {
        await result.current.handleImport("# imported");
      });

      expect(save).toHaveBeenCalledWith("# imported");
      expect(result.current.editorKey).toBe(startingKey);
    });

    it("getContent returns the live draft", async () => {
      const { result } = renderEditor(makeReady("seed"));

      expect(result.current.getContent()).toBe("seed");

      await act(() => {
        result.current.handleChange("edited draft");
      });

      expect(result.current.getContent()).toBe("edited draft");
    });
  });

  describe("charCount", () => {
    it("seeds from the ready content length", () => {
      const { result } = renderEditor(makeReady("hello"));

      expect(result.current.charCount).toBe(5);
    });

    it("tracks the draft length as the user types", async () => {
      const { result } = renderEditor(makeReady("hi"));

      expect(result.current.charCount).toBe(2);

      await act(() => {
        result.current.handleChange("hello world");
      });

      expect(result.current.charCount).toBe(11);
    });

    it("resets to 0 on Clear", async () => {
      stubConfirm(true);
      const { result } = renderEditor(makeReady("hello"));

      await act(async () => {
        await result.current.handleClear();
      });

      expect(result.current.charCount).toBe(0);
    });

    it("resets to the server content length on Reload", async () => {
      const { result, setMemory } = renderEditor(makeReady("old"));

      await act(() => {
        result.current.handleChange("a much longer draft");
      });

      setMemory(makeReady("from-ai"));

      await act(() => {
        result.current.handleReload();
      });

      expect(result.current.charCount).toBe("from-ai".length);
    });

    it("resets to 0 when memory transitions to error", () => {
      const { result, setMemory } = renderEditor(makeReady("hello"));

      expect(result.current.charCount).toBe(5);

      setMemory(makeMemory({ status: { kind: "error", message: "boom" } }));

      expect(result.current.charCount).toBe(0);
    });
  });

  describe("not-ready guards and pre-seed edge cases", () => {
    const loading = (): UseDocMemoryReturn =>
      makeMemory({ status: { kind: "loading" } });

    it("handleClear is a no-op while memory is still loading", async () => {
      const clear = vi.fn().mockResolvedValue(true);
      const { result } = renderEditor(
        makeMemory({ status: { kind: "loading" }, clear }),
      );

      await act(async () => {
        await result.current.handleClear();
      });

      expect(clear).not.toHaveBeenCalled();
    });

    it("handleReload is a no-op while memory is still loading", async () => {
      const { result } = renderEditor(loading());
      const startingKey = result.current.editorKey;

      await act(() => {
        result.current.handleReload();
      });

      expect(result.current.editorKey).toBe(startingKey);
    });

    it("handleImport is a no-op while memory is still loading", async () => {
      const save = vi.fn().mockResolvedValue(true);
      const { result } = renderEditor(
        makeMemory({ status: { kind: "loading" }, save }),
      );

      await act(async () => {
        await result.current.handleImport("# imported");
      });

      expect(save).not.toHaveBeenCalled();
    });

    it("getContent returns an empty string before the draft is seeded", () => {
      const { result } = renderEditor(loading());

      expect(result.current.getContent()).toBe("");
    });

    it("flushSave bails when the memory is no longer ready (e.g. reloading)", async () => {
      const save = vi.fn().mockResolvedValue(true);
      const { result, setMemory } = renderReadyEditor({ save });

      await act(() => {
        result.current.handleChange("typed");
      });

      // Only an error nulls the draft; a loading transition keeps it, so
      // flushSave has a value but must bail on the not-ready status.
      setMemory(makeMemory({ status: { kind: "loading" }, save }));

      await act(() => {
        result.current.handleBlur();
      });

      expect(save).not.toHaveBeenCalled();
    });

    it("skips external-update detection while a failed save has rolled back the baseline", async () => {
      const save = vi.fn().mockResolvedValue(false);
      const { result, setMemory } = renderReadyEditor({ save });

      await typeDraft(result, "typed");
      await flushDebounceWindow(2);

      // The failed save rolled lastSavedRef back to null. A subsequent status
      // update must re-run the external-update effect and bail on the null
      // baseline rather than surfacing a spurious banner.
      setMemory(
        makeMemory({ status: { kind: "ready", content: "server" }, save }),
      );

      expect(result.current.externalUpdate).toBe(false);
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
  });

  describe("unmount flushes pending save", () => {
    it("flushes a debounced save when the editor unmounts mid-debounce (Esc close after typing)", async () => {
      // Regression: cleanup only cleared timers without flushing, so typing
      // then Esc inside the 800ms debounce window dropped the edit.
      const save = vi.fn().mockResolvedValue(true);
      const { result, unmount } = renderReadyEditor({ save });

      await act(() => {
        result.current.handleChange("typed-but-not-yet-saved");
      });

      // Unmount BEFORE the 800ms debounce fires — simulates Esc closing the
      // context overlay shortly after the user typed.
      unmount();

      expect(save).toHaveBeenCalledWith("typed-but-not-yet-saved");
    });

    it("does not schedule a retry loop when the unmount flush's save fails", async () => {
      // Regression: the unmount flush's save promise resolved AFTER cleanup, so
      // a persistent failure re-scheduled a 5s retry forever (re-POSTing and
      // calling setState on a dead component). The mountedRef guard stops it.
      const save = vi.fn().mockResolvedValue(false);
      const { result, unmount } = renderReadyEditor({ save });

      await act(() => {
        result.current.handleChange("typed-but-not-yet-saved");
      });

      // Unmount flushes the pending save; let its (failing) promise settle.
      unmount();
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(save).toHaveBeenCalledTimes(1);

      // Well past the 5s retry interval: no zombie re-POST fired.
      await act(async () => {
        vi.advanceTimersByTime(30000);
        await Promise.resolve();
      });
      expect(save).toHaveBeenCalledTimes(1);
    });
  });
});
