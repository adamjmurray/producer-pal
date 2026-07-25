// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useRef } from "preact/hooks";
import { type Notation } from "#src/shared/notation";
import { type HeaderInfo } from "#webui/components/chat/controls/header/HeaderActions";
import { type ModeContext } from "#webui/components/mode-context";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { type UseSettingsReturn } from "#webui/types/settings";

interface ChatLike {
  activeModel: HeaderInfo["activeModel"];
  activeProvider: HeaderInfo["activeProvider"];
  activeSmallModelMode: boolean | null;
  activeNotation: Notation | null;
  activeEnabledTools: Record<string, boolean> | null;
}

interface UseChatModeReportingParams {
  chat: ChatLike;
  settings: UseSettingsReturn;
  display: PreferencesSettings;
  enabledToolsCount: number;
  totalToolsCount: number;
  handleDeleteAll: () => void;
  handleDeleteUnbookmarked: () => void;
  setModeContext: (ctx: ModeContext) => void;
}

/**
 * Reports the active chat session's lock + delete handlers up to App and
 * builds the HeaderInfo shown in the shell. Pulled out of useChatModeState so
 * its main function stays under the size limit.
 *
 * @param params - reporting inputs
 * @returns The computed HeaderInfo memoed on its inputs
 */
export function useChatModeReporting(
  params: UseChatModeReportingParams,
): HeaderInfo {
  const {
    chat,
    settings,
    display,
    enabledToolsCount,
    totalToolsCount,
    handleDeleteAll,
    handleDeleteUnbookmarked,
    setModeContext,
  } = params;

  // useConversationHandlers builds its useCallback chain on a fresh manager
  // object each render, so handleDeleteAll/Unbookmarked change identity every
  // render. Including them in the effect's deps would cause it to fire on
  // every render, which sets state in App and triggers a re-render — an
  // infinite loop. Read them through a ref instead, and key the effect on the
  // lock values that the SettingsScreen actually cares about.
  const handlersRef = useRef({ handleDeleteAll, handleDeleteUnbookmarked });

  useEffect(() => {
    handlersRef.current = { handleDeleteAll, handleDeleteUnbookmarked };
  }, [handleDeleteAll, handleDeleteUnbookmarked]);

  useEffect(() => {
    setModeContext({
      conversationLock: {
        activeModel: chat.activeModel,
        activeProvider: chat.activeProvider,
        activeSmallModelMode: chat.activeSmallModelMode,
        activeNotation: chat.activeNotation,
        activeEnabledTools: chat.activeEnabledTools,
      },
      onDeleteAllConversations: () => handlersRef.current.handleDeleteAll(),
      onDeleteUnbookmarkedConversations: () =>
        handlersRef.current.handleDeleteUnbookmarked(),
      activeVoice: null,
    });
  }, [
    chat.activeModel,
    chat.activeProvider,
    chat.activeSmallModelMode,
    chat.activeNotation,
    chat.activeEnabledTools,
    setModeContext,
  ]);

  return useMemo(
    () => ({
      activeModel: chat.activeModel,
      activeProvider: chat.activeProvider,
      model: settings.model,
      provider: settings.provider,
      enabledToolsCount,
      totalToolsCount,
      smallModelMode: chat.activeSmallModelMode ?? settings.smallModelMode,
      defaultSmallModelMode: settings.smallModelMode,
      showHelpLinks: display.showHelpLinks,
    }),
    [
      chat.activeModel,
      chat.activeProvider,
      chat.activeSmallModelMode,
      settings.model,
      settings.provider,
      settings.smallModelMode,
      enabledToolsCount,
      totalToolsCount,
      display.showHelpLinks,
    ],
  );
}
