// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from "preact/hooks";
import { type HeaderInfo } from "#webui/components/chat/controls/header/HeaderActions";
import { type ModeContext } from "#webui/components/mode-context";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";

interface VoicePersistenceLike {
  activeConversationId: string | null;
  deleteAllConversations: () => Promise<void>;
  deleteUnbookmarkedConversations: () => Promise<void>;
}

interface UseVoiceModeReportingParams {
  persistence: VoicePersistenceLike;
  display: PreferencesSettings;
  totalToolsCount: number;
  enabledToolsCount: number;
  setModeContext: (ctx: ModeContext) => void;
}

/**
 * Reports the active voice session's lock + delete handlers up to App and
 * builds the HeaderInfo. Voice mode's conversation lock is static (always
 * realtime/openai) but only meaningful when a record is loaded — the lock
 * notice should be invisible on a fresh session.
 *
 * @param params - reporting inputs
 * @returns The computed HeaderInfo
 */
export function useVoiceModeReporting(
  params: UseVoiceModeReportingParams,
): HeaderInfo {
  const {
    persistence,
    display,
    totalToolsCount,
    enabledToolsCount,
    setModeContext,
  } = params;
  const hasActiveVoiceConv = persistence.activeConversationId != null;
  // Read delete handlers via a ref so the effect's deps stay stable —
  // useVoicePersistence returns a fresh object each render and its useCallback
  // dependencies (e.g. `startNewConversation`) change identity per render,
  // which would otherwise re-fire the effect every render and infinite-loop
  // against App's setModeContext.
  const handlersRef = useRef({
    deleteAll: persistence.deleteAllConversations,
    deleteUnbookmarked: persistence.deleteUnbookmarkedConversations,
  });

  useEffect(() => {
    handlersRef.current = {
      deleteAll: persistence.deleteAllConversations,
      deleteUnbookmarked: persistence.deleteUnbookmarkedConversations,
    };
  }, [
    persistence.deleteAllConversations,
    persistence.deleteUnbookmarkedConversations,
  ]);

  useEffect(() => {
    setModeContext({
      conversationLock: {
        activeModel: hasActiveVoiceConv ? OPENAI_REALTIME_MODEL : null,
        activeProvider: hasActiveVoiceConv ? "openai" : null,
        activeSmallModelMode: hasActiveVoiceConv ? false : null,
      },
      onDeleteAllConversations: () => void handlersRef.current.deleteAll(),
      onDeleteUnbookmarkedConversations: () =>
        void handlersRef.current.deleteUnbookmarked(),
    });
  }, [hasActiveVoiceConv, setModeContext]);

  return {
    activeModel: OPENAI_REALTIME_MODEL,
    activeProvider: "openai",
    model: OPENAI_REALTIME_MODEL,
    provider: "openai",
    enabledToolsCount,
    totalToolsCount,
    smallModelMode: false,
    defaultSmallModelMode: false,
    showHelpLinks: display.showHelpLinks,
  };
}
