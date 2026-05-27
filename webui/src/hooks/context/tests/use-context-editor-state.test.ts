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
  type ContextMemoryStatus,
  type SaveStatus,
  type UseContextMemoryReturn,
} from "#webui/hooks/context/use-context-memory";

interface MemoryOverrides {
  status?: ContextMemoryStatus;
  saveStatus?: SaveStatus;
  save?: ReturnType<typeof vi.fn>;
  clear?: ReturnType<typeof vi.fn>;
}

/**
 * Build a `UseContextMemoryReturn` for testing. Defaults to a ready memory
 * with empty content and resolved save/clear stubs; pass overrides to vary.
 * @param overrides - Field overrides
 * @returns A memory-hook return value plus the spies used to assert
 */
function makeMemory(overrides: MemoryOverrides = {}): UseContextMemoryReturn {
  // vi.fn() is typed broadly enough that .mockResolvedValue() returns a
  // generic Mock that doesn't satisfy the precise signatures on the hook
  // return type; cast each one to the field's expected shape.
  return {
    status: overrides.status ?? { kind: "ready", content: "" },
    enabled: true,
    writable: false,
    saveStatus: overrides.saveStatus ?? "idle",
    saveError: null,
    save: (overrides.save ??
      vi.fn().mockResolvedValue(true)) as UseContextMemoryReturn["save"],
    setEnabled: vi
      .fn()
      .mockResolvedValue(
        true,
      ) as unknown as UseContextMemoryReturn["setEnabled"],
    setWritable: vi
      .fn()
      .mockResolvedValue(
        true,
      ) as unknown as UseContextMemoryReturn["setWritable"],
    clear: (overrides.clear ??
      vi.fn().mockResolvedValue(true)) as UseContextMemoryReturn["clear"],
    refresh: vi
      .fn()
      .mockResolvedValue(
        undefined,
      ) as unknown as UseContextMemoryReturn["refresh"],
  };
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
      let memory = makeMemory({
        status: { kind: "ready", content: "old" },
        save,
      });
      const { result, rerender } = renderHook(
        ({ memory: m }) => useContextEditorState(m),
        { initialProps: { memory } },
      );

      // User types — populates draftRef. Don't advance the debounce timer.
      await act(() => {
        result.current.handleChange("draft");
      });

      // Status flips to error. Editor unmounts in the real UI. Refs should
      // be nulled by the new effect.
      memory = makeMemory({
        status: { kind: "error", message: "boom" },
        save,
      });
      rerender({ memory });

      // Server externally moves to "fresh"; status recovers to ready.
      memory = makeMemory({
        status: { kind: "ready", content: "fresh" },
        save,
      });
      rerender({ memory });

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
      let memory = makeMemory({
        status: { kind: "ready", content: "old" },
        save,
      });
      const { result, rerender } = renderHook(
        ({ memory: m }) => useContextEditorState(m),
        { initialProps: { memory } },
      );

      memory = makeMemory({
        status: { kind: "error", message: "boom" },
        save,
      });
      rerender({ memory });
      memory = makeMemory({
        status: { kind: "ready", content: "fresh" },
        save,
      });
      rerender({ memory });

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
      let memory = makeMemory({ status: { kind: "ready", content: "old" } });
      const { result, rerender } = renderHook(
        ({ memory: m }) => useContextEditorState(m),
        { initialProps: { memory } },
      );

      await act(() => {
        result.current.handleChange("typing");
      });

      memory = makeMemory({ status: { kind: "ready", content: "from-ai" } });
      rerender({ memory });

      expect(result.current.externalUpdate).toBe(false);
    });

    it("surfaces the banner when server content changes while the draft is clean", async () => {
      let memory = makeMemory({ status: { kind: "ready", content: "old" } });
      const { result, rerender } = renderHook(
        ({ memory: m }) => useContextEditorState(m),
        { initialProps: { memory } },
      );

      // Mount-time seed: draftRef=lastSavedRef="old". No typing.
      expect(result.current.externalUpdate).toBe(false);

      // Server-side write lands via the focus refresh → status updates.
      memory = makeMemory({ status: { kind: "ready", content: "from-ai" } });
      rerender({ memory });

      expect(result.current.externalUpdate).toBe(true);
    });

    it("hides the banner on the user's first keystroke (last-write-wins)", async () => {
      let memory = makeMemory({ status: { kind: "ready", content: "old" } });
      const { result, rerender } = renderHook(
        ({ memory: m }) => useContextEditorState(m),
        { initialProps: { memory } },
      );

      memory = makeMemory({ status: { kind: "ready", content: "from-ai" } });
      rerender({ memory });
      expect(result.current.externalUpdate).toBe(true);

      await act(() => {
        result.current.handleChange("user override");
      });

      expect(result.current.externalUpdate).toBe(false);
    });

    it("handleReload adopts the server's content as the new baseline and remounts the editor", async () => {
      let memory = makeMemory({ status: { kind: "ready", content: "old" } });
      const { result, rerender } = renderHook(
        ({ memory: m }) => useContextEditorState(m),
        { initialProps: { memory } },
      );
      const startingKey = result.current.editorKey;

      memory = makeMemory({ status: { kind: "ready", content: "from-ai" } });
      rerender({ memory });
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
      let memory = makeMemory({ status: { kind: "ready", content: "old" } });
      const { result, rerender } = renderHook(
        ({ memory: m }) => useContextEditorState(m),
        { initialProps: { memory } },
      );

      memory = makeMemory({ status: { kind: "ready", content: "from-ai" } });
      rerender({ memory });
      expect(result.current.externalUpdate).toBe(true);

      // External writer reverts to the baseline (or the editor was reseeded
      // out-of-band): the banner should drop.
      memory = makeMemory({ status: { kind: "ready", content: "old" } });
      rerender({ memory });
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
      const memory = makeMemory({
        status: { kind: "ready", content: "old" },
        save,
        clear,
      });
      const { result } = renderHook(() => useContextEditorState(memory));

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
      const memory = makeMemory({
        status: { kind: "ready", content: "old" },
        clear,
      });
      const { result } = renderHook(() => useContextEditorState(memory));

      vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

      await act(async () => {
        await result.current.handleClear();
      });

      expect(clear).toHaveBeenCalledTimes(1);
    });

    it("handleClear is a no-op when the user cancels confirm", async () => {
      const clear = vi.fn().mockResolvedValue(true);
      const memory = makeMemory({
        status: { kind: "ready", content: "old" },
        clear,
      });
      const { result } = renderHook(() => useContextEditorState(memory));

      vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

      await act(async () => {
        await result.current.handleClear();
      });

      expect(clear).not.toHaveBeenCalled();
    });
  });
});
