// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useStreamEndAutosave } from "#webui/hooks/chat/helpers/conversations/use-stream-end-autosave";

/**
 * Render the hook with a spied autosave and teardown.
 * @returns The spies plus helpers to drive streaming and teardown
 */
function renderAutosave() {
  const autoSave = vi.fn();
  const autoSaveRef = { current: autoSave };
  const clearConversation = vi.fn();
  const handle = renderHook(
    ({ responding }: { responding: boolean }) =>
      useStreamEndAutosave({
        isAssistantResponding: responding,
        autoSaveRef,
        clearConversation,
      }),
    { initialProps: { responding: false } },
  );

  return {
    autoSave,
    clearConversation,
    /**
     * Set whether a stream is in flight and flush the effect.
     * @param responding - The new streaming state
     */
    setResponding: async (responding: boolean): Promise<void> => {
      await act(() => handle.rerender({ responding }));
    },
    /** Tear the conversation down, the way a switch or New does. */
    teardown: async (): Promise<void> => {
      await act(() => handle.result.current());
    },
  };
}

describe("useStreamEndAutosave", () => {
  it("saves when a stream ends with the conversation still in place", async () => {
    const { autoSave, setResponding } = renderAutosave();

    await setResponding(true);
    expect(autoSave).not.toHaveBeenCalled();

    await setResponding(false);
    expect(autoSave).toHaveBeenCalledTimes(1);
  });

  it("does not save when nothing was streaming", async () => {
    const { autoSave, setResponding } = renderAutosave();

    await setResponding(false);
    expect(autoSave).not.toHaveBeenCalled();
  });

  it("saves from the teardown when the user leaves mid-stream", async () => {
    const { autoSave, clearConversation, setResponding, teardown } =
      renderAutosave();

    await setResponding(true);
    await teardown();

    expect(autoSave).toHaveBeenCalledTimes(1);
    expect(clearConversation).toHaveBeenCalledTimes(1);
    // The save has to capture the history and the id before they are torn down.
    expect(autoSave.mock.invocationCallOrder[0]).toBeLessThan(
      clearConversation.mock.invocationCallOrder[0]!,
    );
  });

  it("does not save again once the torn-down stream ends", async () => {
    const { autoSave, setResponding, teardown } = renderAutosave();

    await setResponding(true);
    await teardown();
    // The stop that accompanies leaving lands after the teardown, so the
    // deferred effect must not write over whatever the user moved to.
    await setResponding(false);

    expect(autoSave).toHaveBeenCalledTimes(1);
  });

  it("does not save on a teardown with no stream in flight", async () => {
    const { autoSave, clearConversation, teardown } = renderAutosave();

    await teardown();

    expect(autoSave).not.toHaveBeenCalled();
    expect(clearConversation).toHaveBeenCalledTimes(1);
  });

  it("does not save on a teardown after the stream already ended", async () => {
    const { autoSave, setResponding, teardown } = renderAutosave();

    await setResponding(true);
    await setResponding(false);
    expect(autoSave).toHaveBeenCalledTimes(1);

    await teardown();
    expect(autoSave).toHaveBeenCalledTimes(1);
  });

  it("saves the next stream that runs to its end after a teardown", async () => {
    const { autoSave, setResponding, teardown } = renderAutosave();

    await setResponding(true);
    await teardown();
    await setResponding(false);
    expect(autoSave).toHaveBeenCalledTimes(1);

    await setResponding(true);
    await setResponding(false);
    expect(autoSave).toHaveBeenCalledTimes(2);
  });
});
