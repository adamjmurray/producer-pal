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
      const { result, setMemory } = renderEditor(
        makeMemory({ status: { kind: "ready", content: "old" }, save }),
      );

      // User types — populates draftRef. Don't advance the debounce timer.
      await act(() => {
        result.current.handleChange("draft");
      });

      // Status flips to error. Editor unmounts in the real UI. Refs should
      // be nulled by the new effect.
      setMemory(
        makeMemory({ status: { kind: "error", message: "boom" }, save }),
      );

      // Server externally moves to "fresh"; status recovers to ready.
      setMemory(
        makeMemory({ status: { kind: "ready", content: "fresh" }, save }),
      );

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
      const { result, setMemory } = renderEditor(
        makeMemory({ status: { kind: "ready", content: "old" }, save }),
      );

      setMemory(
        makeMemory({ status: { kind: "error", message: "boom" }, save }),
      );
      setMemory(
        makeMemory({ status: { kind: "ready", content: "fresh" }, save }),
      );

      await act(() => {
        result.current.handleChange("post-recovery edit");
      });
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

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
      let resolveSave: (saved: boolean) => void = () => {};
      const save = vi.fn().mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolveSave = resolve;
          }),
      );
      const clear = vi.fn().mockResolvedValue(true);
      const { result } = renderEditor(
        makeMemory({
          status: { kind: "ready", content: "old" },
          save,
          clear,
        }),
      );

      vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

      // Trigger a debounced save that the test will hold in-flight.
      await act(() => {
        result.current.handleChange("draft");
      });
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(clear).not.toHaveBeenCalled();

      // Fire Clear. Promise stays pending until we resolve the save below.
      let clearPromise: Promise<void> | null = null;

      await act(() => {
        clearPromise = result.current.handleClear();
      });
      // Allow microtasks to run; clear must still be blocked on the in-flight save.
      await act(async () => {
        for (let i = 0; i < 3; i++) await Promise.resolve();
      });
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
      const { result } = renderEditor(
        makeMemory({ status: { kind: "ready", content: "old" }, clear }),
      );

      vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

      await act(async () => {
        await result.current.handleClear();
      });

      expect(clear).toHaveBeenCalledTimes(1);
    });

    it("handleClear is a no-op when the user cancels confirm", async () => {
      const clear = vi.fn().mockResolvedValue(true);
      const { result } = renderEditor(
        makeMemory({ status: { kind: "ready", content: "old" }, clear }),
      );

      vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

      await act(async () => {
        await result.current.handleClear();
      });

      expect(clear).not.toHaveBeenCalled();
    });
  });

  describe("dirty flag", () => {
    it("starts false, flips true on edit, flips false after a successful save", async () => {
      const save = vi.fn().mockResolvedValue(true);
      const { result } = renderEditor(
        makeMemory({ status: { kind: "ready", content: "old" }, save }),
      );

      expect(result.current.dirty).toBe(false);

      await act(() => {
        result.current.handleChange("typed");
      });
      expect(result.current.dirty).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.dirty).toBe(false);
    });

    it("stays true when the user keeps typing during an in-flight save", async () => {
      // The save() promise is held until we explicitly resolve it. During the
      // in-flight save, the user types more — draftRef advances past the
      // value being saved, so the save's resolution must NOT clear dirty.
      let resolveSave: (saved: boolean) => void = () => {};
      const save = vi.fn().mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolveSave = resolve;
          }),
      );
      const { result } = renderEditor(
        makeMemory({ status: { kind: "ready", content: "old" }, save }),
      );

      await act(() => {
        result.current.handleChange("first");
      });
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });
      expect(result.current.dirty).toBe(true);

      // User types more before the save responds.
      await act(() => {
        result.current.handleChange("second");
      });

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

  describe("import", () => {
    it("imports into an empty editor without confirming, saves, and remounts", async () => {
      const save = vi.fn().mockResolvedValue(true);
      const confirm = vi.fn().mockReturnValue(true);

      vi.stubGlobal("confirm", confirm);
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
      const confirm = vi.fn().mockReturnValue(true);

      vi.stubGlobal("confirm", confirm);
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

      vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
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
      vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
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

  describe("unmount flushes pending save", () => {
    it("flushes a debounced save when the editor unmounts mid-debounce (Esc close after typing)", async () => {
      // Regression: cleanup only cleared timers without flushing, so typing
      // then Esc inside the 800ms debounce window dropped the edit.
      const save = vi.fn().mockResolvedValue(true);
      const { result, unmount } = renderEditor(
        makeMemory({ status: { kind: "ready", content: "old" }, save }),
      );

      await act(() => {
        result.current.handleChange("typed-but-not-yet-saved");
      });

      // Unmount BEFORE the 800ms debounce fires — simulates Esc closing the
      // context overlay shortly after the user typed.
      unmount();

      expect(save).toHaveBeenCalledWith("typed-but-not-yet-saved");
    });
  });
});
