// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { act } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as conversationDb from "#webui/lib/conversation-db";
import { deferred } from "#webui/hooks/context/tests/doc-transport-test-helpers";
import {
  loadSavedVoiceSession,
  resetConversationsDb,
  userTextItem,
  waitForAutosave,
  waitForEffects,
} from "./voice-persistence-test-helpers";

beforeEach(async () => {
  window.location.hash = "";
  await resetConversationsDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useVoicePersistence when the autosave write fails", () => {
  it("shows the failure instead of leaving an unhandled rejection", async () => {
    const { result, rerender } = await loadSavedVoiceSession();

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    vi.spyOn(conversationDb, "saveConversation").mockRejectedValue(
      new Error("transaction aborted"),
    );

    rerender([userTextItem("first turn"), userTextItem("second turn")]);
    await waitForAutosave();

    expect(result.current.limitNotification).toStrictEqual({
      message: expect.stringContaining("transaction aborted"),
      type: "error",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to save voice conversation",
      expect.any(Error),
    );
  });

  it("keeps a refusal off the conversation the user moved to", async () => {
    const { result, rerender } = await loadSavedVoiceSession();

    // Hold the write open so the user can leave before it answers.
    const write =
      deferred<Awaited<ReturnType<typeof conversationDb.saveConversation>>>();

    vi.spyOn(conversationDb, "saveConversation").mockReturnValueOnce(
      write.promise,
    );

    rerender([userTextItem("first turn"), userTextItem("second turn")]);
    await waitForEffects(4);

    await act(() => result.current.startNewConversation());

    await act(async () => {
      write.resolve({ deletedCount: 0, limitReached: false, saved: false });
      await waitForAutosave();
    });

    // The banner belongs to the conversation that was refused, not to the fresh
    // one the user is now talking into.
    expect(result.current.limitNotification).toBeNull();
  });
});
