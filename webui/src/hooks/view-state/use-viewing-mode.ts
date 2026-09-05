// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "preact/hooks";
import { type ConversationRecord } from "#webui/lib/conversation-db";

export interface ViewingMode {
  /** Mode to render regardless of the saved model, or null to follow it. */
  viewingMode: "chat" | "voice" | null;
  /** Pin the mode a foreign-mode record needs to render in. */
  onForeignRecord: (record: ConversationRecord) => void;
  /** Drop the override so the next session follows the saved model again. */
  clearViewingMode: () => void;
}

/**
 * Overrides App's mode routing so a foreign-mode conversation (e.g. a voice
 * record opened while the saved model is a chat one) renders in its native UI
 * without mutating the user's saved settings.
 * @returns The current override and the handlers that set and clear it
 */
export function useViewingMode(): ViewingMode {
  const [viewingMode, setViewingMode] = useState<"chat" | "voice" | null>(null);
  const onForeignRecord = useCallback((record: ConversationRecord) => {
    setViewingMode(record.sessionType === "voice" ? "voice" : "chat");
  }, []);
  const clearViewingMode = useCallback(() => {
    setViewingMode(null);
  }, []);

  return { viewingMode, onForeignRecord, clearViewingMode };
}
