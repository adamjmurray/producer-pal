// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

// The sidebar is shared with chat, so its delete control has to be as
// recoverable here as it is there.

import "fake-indexeddb/auto";
import { act, renderHook } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type UndoDeleteReturn,
  useUndoDelete,
} from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import {
  type UseVoicePersistenceReturn,
  useVoicePersistence,
} from "#webui/hooks/voice/use-voice-persistence";
import * as conversationDb from "#webui/lib/conversation-db";
import { loadConversation } from "#webui/lib/conversation-db";
import {
  resetConversationsDb,
  saveVoiceRecord,
  userTextItem,
  waitForEffects,
} from "./voice-persistence-test-helpers";

interface UndoView {
  persistence: UseVoicePersistenceReturn;
  undoDelete: UndoDeleteReturn;
}

/**
 * Render the voice persistence hook alongside the undo stack App owns, so a
 * test can drive the delete and read the banner it produces.
 * @returns The rendered hook result
 */
function renderWithUndo(): { current: UndoView } {
  const { result } = renderHook((): UndoView => {
    const undoDelete = useUndoDelete();

    return {
      undoDelete,
      persistence: useVoicePersistence({ liveHistory: [], undoDelete }),
    };
  });

  return result;
}

beforeEach(async () => {
  window.location.hash = "";
  await resetConversationsDb();
});

describe("useVoicePersistence undo", () => {
  it("offers a deleted voice conversation back, transcript intact", async () => {
    const record = await saveVoiceRecord({
      title: "Jam session",
      voiceHistory: [userTextItem("make a beat")],
    });
    const result = renderWithUndo();

    await waitForEffects();
    await act(() => result.current.persistence.deleteConversation(record.id));

    expect(await loadConversation(record.id)).toBeUndefined();
    expect(result.current.undoDelete.undoNotification?.message).toBe(
      "Deleted “Jam session”",
    );

    await act(() =>
      result.current.undoDelete.undoNotification!.action!.onClick(),
    );
    await waitForEffects();

    const restored = await loadConversation(record.id);

    expect(restored?.voiceHistory).toStrictEqual([userTextItem("make a beat")]);
    // The restore refreshed the list it was restored into.
    expect(result.current.persistence.conversations.map((c) => c.id)).toContain(
      record.id,
    );
  });

  it("drops a pending undo that a wipe would have taken anyway", async () => {
    const record = await saveVoiceRecord({ title: "Doomed" });
    const result = renderWithUndo();

    await waitForEffects();
    await act(() => result.current.persistence.deleteConversation(record.id));
    expect(result.current.undoDelete.undoNotification).not.toBeNull();

    await act(() => result.current.persistence.deleteAllConversations());

    expect(result.current.undoDelete.undoNotification).toBeNull();
  });

  // An undo record is the only copy left of a deleted conversation, so a wipe
  // that never happened must not be what destroys it.
  it("keeps a pending undo when the wipe itself fails", async () => {
    const record = await saveVoiceRecord({ title: "Doomed" });
    const result = renderWithUndo();

    await waitForEffects();
    await act(() => result.current.persistence.deleteConversation(record.id));

    const wipe = vi
      .spyOn(conversationDb, "deleteAllConversations")
      .mockRejectedValue(new Error("quota"));

    await act(async () => {
      await expect(
        result.current.persistence.deleteAllConversations(),
      ).rejects.toThrow("quota");
    });

    expect(result.current.undoDelete.undoNotification?.message).toBe(
      "Deleted “Doomed”",
    );
    wipe.mockRestore();
  });

  it("keeps a bookmarked record's undo through a delete-unbookmarked sweep", async () => {
    const record = await saveVoiceRecord({
      title: "Kept",
      bookmarked: true,
    });
    const result = renderWithUndo();

    await waitForEffects();
    await act(() => result.current.persistence.deleteConversation(record.id));
    await act(() =>
      result.current.persistence.deleteUnbookmarkedConversations(),
    );

    expect(result.current.undoDelete.undoNotification?.message).toBe(
      "Deleted “Kept”",
    );
  });
});
