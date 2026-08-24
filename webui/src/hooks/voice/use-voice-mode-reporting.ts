// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from "preact/hooks";
import { type HeaderInfo } from "#webui/components/chat/controls/header/HeaderActions";
import { type ModeContext } from "#webui/components/mode-context";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { type Provider } from "#webui/types/settings";

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
  /** Voice id locked into the live RealtimeSession (null when idle). Reported
   * up so the settings Voice picker can flag mid-session pending changes. */
  activeVoice: string | null;
  /** Realtime model the active voice session/record runs on. Reported as the
   * conversation-lock model so a non-default realtime model isn't shown (or
   * flagged as diverging) as the default. */
  activeModel: string;
  /** The user's saved model/provider — used so the top bar can flag divergence
   * when a voice record is being viewed but saved settings point at a chat
   * model (e.g. opening a voice convo from history while saved is GPT-5). */
  savedModel: string;
  savedProvider: Provider;
  /** The provider backing the active voice session ("openai" | "gemini"). Drives
   * the header brand label and the saved-vs-active divergence check, so a Gemini
   * session shows "Google" and isn't flagged as diverging from saved. */
  activeProvider: Provider;
}

/**
 * Reports the active voice session's lock + delete handlers up to App and
 * builds the HeaderInfo. Voice mode's conversation lock is a realtime model on
 * the active provider (OpenAI or Gemini) but only meaningful when a record is
 * loaded — the lock notice should be invisible on a fresh session.
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
    activeVoice,
    activeModel,
    savedModel,
    savedProvider,
    activeProvider,
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
        activeModel: hasActiveVoiceConv ? activeModel : null,
        activeProvider: hasActiveVoiceConv ? activeProvider : null,
        activeSmallModelMode: hasActiveVoiceConv ? false : null,
        // Voice locks no notation of its own — its MCP calls fall through to the
        // device global, so there is never anything to diverge from.
        activeNotation: null,
        // Voice reconnects its tools from current settings every session, and a
        // voice transcript isn't resumable, so there is no earlier toolset to
        // report having drifted from either.
        activeEnabledTools: null,
        // Voice runs no agentic tool loop, so no step budget to pin.
        activeMaxToolSteps: null,
      },
      onDeleteAllConversations: () => void handlersRef.current.deleteAll(),
      onDeleteUnbookmarkedConversations: () =>
        void handlersRef.current.deleteUnbookmarked(),
      activeVoice,
    });
  }, [
    hasActiveVoiceConv,
    setModeContext,
    activeVoice,
    activeModel,
    activeProvider,
  ]);

  return {
    activeModel,
    activeProvider,
    model: savedModel,
    provider: savedProvider,
    enabledToolsCount,
    totalToolsCount,
    // Voice pins no toolset, so the count IS the current setting — nothing can
    // diverge from it (same reason smallModelMode is hardcoded below).
    defaultToolsCount: enabledToolsCount,
    smallModelMode: false,
    defaultSmallModelMode: false,
    showHelpLinks: display.showHelpLinks,
  };
}
