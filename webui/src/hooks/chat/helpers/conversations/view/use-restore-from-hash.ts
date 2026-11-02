// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useEffect } from "preact/hooks";
import { getHashConversationId } from "#webui/hooks/chat/helpers/conversations/view/use-hash-navigation";
import { type ViewSequence } from "#webui/hooks/chat/helpers/conversations/view/use-view-sequence";
import {
  type ConversationRecord,
  loadConversation,
} from "#webui/lib/conversation-db";
import { type ConversationStore } from "#webui/lib/conversations/conversation-store";

/**
 * On mount, load the conversation list and open the conversation the URL hash
 * names. A switch or new chat made while it loads wins.
 * @param deps - What the restore needs from useConversations
 * @param deps.refreshList - Reloads the sidebar list
 * @param deps.restoreRecord - Puts a record's messages on screen
 * @param deps.onForeignRecord - Takes a voice record, which chat can't replay
 * @param deps.store - The active conversation
 * @param deps.view - Counts changes of the chat on screen
 */
export function useRestoreFromHash({
  refreshList,
  restoreRecord,
  onForeignRecord,
  store,
  view,
}: {
  refreshList: () => Promise<void>;
  restoreRecord: (record: ConversationRecord) => void;
  onForeignRecord?: (record: ConversationRecord) => void;
  store: ConversationStore;
  view: ViewSequence;
}): void {
  useEffect(() => {
    const init = async () => {
      const seq = view.current();

      await refreshList();
      const hashId = getHashConversationId();

      if (!hashId) {
        return;
      }

      const record = await loadConversation(hashId);

      if (seq !== view.current()) {
        return;
      }

      if (record?.sessionType === "voice") {
        if (onForeignRecord) {
          onForeignRecord(record);
        } else {
          store.reset();
        }

        return;
      }

      if (record && record.messages.length > 0) {
        store.adopt(record);
        restoreRecord(record);
      } else {
        // Hash ID no longer exists in DB
        store.reset();
      }
    };

    void init();
  }, [refreshList, restoreRecord, onForeignRecord, store, view]);
}
