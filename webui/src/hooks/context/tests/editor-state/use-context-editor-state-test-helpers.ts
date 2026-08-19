// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared fixtures for the useContextEditorState suites (the main behavioral
// file and the write-ordering file). Callers keep the
// `@vitest-environment happy-dom` directive in their own file (it must be
// file-level) and install fake timers themselves — several of these advance
// them.

import { act, renderHook } from "@testing-library/preact";
import { expect, vi } from "vitest";
import { useContextEditorState } from "#webui/hooks/context/use-context-editor-state";
import {
  type DocStatus,
  type SaveStatus,
  type UseDocReturn,
} from "#webui/hooks/context/use-doc";

export interface MemoryOverrides {
  status?: DocStatus;
  saveStatus?: SaveStatus;
  save?: ReturnType<typeof vi.fn>;
  clear?: ReturnType<typeof vi.fn>;
}

/**
 * Build a `UseDocReturn` for testing. Defaults to a ready memory
 * with empty content and resolved save/clear stubs; pass overrides to vary.
 * @param overrides - Field overrides
 * @returns A memory-hook return value plus the spies used to assert
 */
export function makeMemory(overrides: MemoryOverrides = {}): UseDocReturn {
  // vi.fn() is typed broadly enough that .mockResolvedValue() returns a
  // generic Mock that doesn't satisfy the precise signatures on the hook
  // return type; cast each one to the field's expected shape.
  return {
    status: overrides.status ?? { kind: "ready", content: "" },
    saveStatus: overrides.saveStatus ?? "idle",
    saveError: null,
    save: (overrides.save ??
      vi.fn().mockResolvedValue(true)) as UseDocReturn["save"],
    clear: (overrides.clear ??
      vi.fn().mockResolvedValue(true)) as UseDocReturn["clear"],
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Render the hook over a memory, with a setter to swap the memory in place.
 * @param memory - The memory-hook return to render over
 * @returns The hook result handle plus unmount/setMemory
 */
export function renderEditor(memory: UseDocReturn) {
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
    setMemory: (next: UseDocReturn) => rerender({ memory: next }),
  };
}

export const makeReady = (content: string): UseDocReturn =>
  makeMemory({ status: { kind: "ready", content } });

/**
 * Render the editor over a ready memory (content "old") with the given spy
 * overrides — the starting point most edit/save/clear tests share.
 * @param overrides - Extra memory fields (save/clear spies, saveStatus, …)
 * @returns The rendered editor (result/setMemory/unmount)
 */
export function renderReadyEditor(overrides: MemoryOverrides = {}) {
  return renderEditor(
    makeMemory({ status: { kind: "ready", content: "old" }, ...overrides }),
  );
}

export type RenderedEditor = ReturnType<typeof renderEditor>;

/**
 * A save spy that stays pending until the test resolves it, so a test can
 * assert the intermediate saving state before the write settles.
 * @returns The save spy and a trigger to resolve the pending save
 */
export function deferredSave(): {
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

/**
 * A save spy whose FIRST call stays pending until the test resolves it, with
 * every later call resolving true — for cases that hold one write open and then
 * assert whether the next one reaches the wire.
 * @returns The save spy and a trigger to resolve the first save
 */
export function deferredFirstSave(): {
  save: ReturnType<typeof vi.fn>;
  resolveFirstSave: (saved: boolean) => void;
} {
  let resolve: (saved: boolean) => void = () => {};
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue(true);

  return { save, resolveFirstSave: (saved) => resolve(saved) };
}

/**
 * A save spy whose every call stays pending until the test resolves it by call
 * index, so a test can hold several writes in flight at once and settle them in
 * a chosen order. {@link deferredSave} covers the single-write case; this one is
 * for overlaps where the same spy backs more than one write.
 * @returns The save spy and a resolver taking the 0-based call index
 */
export function deferredSaveQueue(): {
  save: ReturnType<typeof vi.fn>;
  resolveCall: (index: number, saved: boolean) => void;
} {
  const resolvers: Array<(saved: boolean) => void> = [];
  const save = vi.fn().mockImplementation(
    () =>
      new Promise<boolean>((r) => {
        resolvers.push(r);
      }),
  );

  return { save, resolveCall: (index, saved) => resolvers[index]?.(saved) };
}

/**
 * Type into the editor draft without advancing any timers, leaving the
 * debounced save armed but unfired.
 * @param result - The rendered hook's result handle
 * @param value - The draft text to type
 */
export async function typeDraft(
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
export async function flushDebounceWindow(microtaskTurns = 1): Promise<void> {
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
export async function drainMicrotasks(turns = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < turns; i++) await Promise.resolve();
  });
}

/**
 * Fire Clear (its confirm already stubbed) and prove it is still blocked on an
 * in-flight save: the clear POST must not go out until every save it was
 * ordered behind has settled.
 * @param result - The rendered hook's result handle
 * @param clear - The clear spy, asserted not to have fired yet
 * @returns The pending handleClear promise, for the test to await later
 */
export async function startBlockedClear(
  result: RenderedEditor["result"],
  clear: ReturnType<typeof vi.fn>,
): Promise<{ pending: Promise<boolean> }> {
  const started = await startClear(result);

  // Allow microtasks to run; clear must still be waiting on the in-flight save.
  await drainMicrotasks();
  expect(clear).not.toHaveBeenCalled();

  return started;
}

/**
 * Fire Clear and hand back its still-pending promise, asserting nothing about
 * whether it dispatched. Use {@link startBlockedClear} when the point is that it
 * must still be waiting on an in-flight save.
 * @param result - The rendered hook's result handle
 * @returns The pending handleClear promise, for the test to await later
 */
export async function startClear(
  result: RenderedEditor["result"],
): Promise<{ pending: Promise<boolean> }> {
  let clearPromise: Promise<boolean> | null = null;

  await act(() => {
    clearPromise = result.current.handleClear();
  });

  // Wrapped, not returned bare: an async function returning a promise awaits it,
  // which would hang here — the whole point is that this one is still pending.
  return { pending: clearPromise as unknown as Promise<boolean> };
}

/**
 * Render a ready editor with a confirmed Clear already on the wire and held
 * open, the starting position for every "what happens during a Clear" case.
 * @returns The autosave spy, the clear spy and its resolver, the hook handle,
 *   and the still-pending clear promise
 */
export async function startHeldClear(): Promise<{
  save: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  resolveClear: (saved: boolean) => void;
  result: RenderedEditor["result"];
  clearPromise: Promise<boolean>;
}> {
  const save = vi.fn().mockResolvedValue(true);
  const { save: clear, resolveSave: resolveClear } = deferredSave();
  const { result } = renderReadyEditor({ save, clear });

  stubConfirm(true);

  const { pending: clearPromise } = await startClear(result);

  return { save, clear, resolveClear, result, clearPromise };
}

/**
 * Stub `window.confirm` to return the given answer.
 * @param answer - What confirm() should return (accept vs cancel)
 * @returns The confirm spy, for asserting whether/how it was called
 */
export function stubConfirm(answer: boolean): ReturnType<typeof vi.fn> {
  const confirm = vi.fn().mockReturnValue(answer);

  vi.stubGlobal("confirm", confirm);

  return confirm;
}
