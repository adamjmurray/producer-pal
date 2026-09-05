// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { act, renderHook } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type UndoDeleteReturn,
  useUndoDelete,
} from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import {
  type UseConversationsReturn,
  useConversations,
} from "#webui/hooks/chat/use-conversations";
import * as conversationDb from "#webui/lib/conversation-db";
import {
  createConversationsProps as createProps,
  resetConversationsTestState,
  saveWithMessage,
  waitForEffects,
} from "#webui/hooks/chat/tests/conversations/use-conversations-test-helpers";

interface UndoView {
  manager: UseConversationsReturn;
  undoDelete: UndoDeleteReturn;
}

beforeEach(resetConversationsTestState);

describe("useBulkDeletes and the undo stack", () => {
  // An undo record is the only copy left of a deleted conversation — the DB row
  // is already gone when it is pushed — so a wipe that never happened must not
  // be what destroys it.
  it("keeps a pending undo when the wipe itself fails", async () => {
    const { props, state } = createProps();
    const { result } = renderHook((): UndoView => {
      const undoDelete = useUndoDelete();

      return {
        undoDelete,
        manager: useConversations({ ...props, undoDelete }),
      };
    });

    await waitForEffects();
    await saveWithMessage(
      state,
      { current: result.current.manager },
      "keep me",
    );

    const id = result.current.manager.activeConversationId!;

    await act(() => result.current.manager.deleteConversation(id));
    expect(result.current.undoDelete.undoNotification).not.toBeNull();

    const wipe = vi
      .spyOn(conversationDb, "deleteAllConversations")
      .mockRejectedValue(new Error("quota"));

    await act(async () => {
      await expect(
        result.current.manager.deleteAllConversations(),
      ).rejects.toThrow("quota");
    });

    expect(result.current.undoDelete.undoNotification).not.toBeNull();
    wipe.mockRestore();
  });
});
