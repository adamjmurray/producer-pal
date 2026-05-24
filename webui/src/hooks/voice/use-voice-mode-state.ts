// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import { type ModeContext } from "#webui/components/mode-context";
import { useConversationTransfer } from "#webui/hooks/chat/use-conversation-transfer";
import { useClearViewingModeOnReset } from "#webui/hooks/use-clear-viewing-mode-on-reset";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { type ViewState } from "#webui/hooks/use-view-state";
import { realtimeItemsToUIMessages } from "#webui/hooks/voice/realtime-items-to-ui-messages";
import { useVoiceModeReporting } from "#webui/hooks/voice/use-voice-mode-reporting";
import { useVoicePersistence } from "#webui/hooks/voice/use-voice-persistence";
import { mergeVoiceHistory } from "#webui/hooks/voice/use-voice-persistence-helpers";
import { useVoiceSession } from "#webui/hooks/voice/use-voice-session";
import { type ConversationRecord } from "#webui/lib/conversation-db";
import { type UseSettingsReturn } from "#webui/types/settings";
import { isFirefox } from "#webui/utils/browser-detect";
import { getMcpUrl } from "#webui/utils/mcp-url";

export interface UseVoiceModeStateParams {
  settings: UseSettingsReturn;
  display: PreferencesSettings;
  viewState: ViewState;
  setViewState: (partial: Partial<ViewState>) => void;
  totalToolsCount: number;
  enabledToolsCount: number;
  onForeignRecord: (record: ConversationRecord) => void;
  clearViewingMode: () => void;
  setModeContext: (ctx: ModeContext) => void;
}

/**
 * Composes the voice-mode hook graph (session, persistence, transfer) and
 * reports the active session's lock + delete handlers up to App via
 * setModeContext. Pulled out of VoiceApp so its main function stays under the
 * size limit.
 *
 * @param params - Voice-mode hook inputs
 * @returns Voice state + handlers ready for the VoiceApp render
 */
export function useVoiceModeState(params: UseVoiceModeStateParams) {
  const {
    settings,
    display,
    viewState,
    setViewState,
    totalToolsCount,
    enabledToolsCount,
    onForeignRecord,
    clearViewingMode,
    setModeContext,
  } = params;

  const mcpUrl = useMemo(() => getMcpUrl(), []);
  const voiceTokenUrl = useMemo(
    () => mcpUrl.replace(/\/mcp$/, "/voice-token"),
    [mcpUrl],
  );
  const openAiKey =
    settings.provider === "openai" && settings.apiKey ? settings.apiKey : null;
  const firefoxDetected = useMemo(() => isFirefox(), []);
  const historyPanelOpen = viewState.historyPanelOpen;
  const setHistoryPanelOpen = useCallback(
    (updater: (open: boolean) => boolean) => {
      setViewState({ historyPanelOpen: updater(historyPanelOpen) });
    },
    [historyPanelOpen, setViewState],
  );

  const voice = useVoiceSession({
    mcpUrl,
    voiceTokenUrl,
    openAiKey,
    enabledTools: settings.enabledTools,
    voice: settings.savedRealtimeVoice,
    speed: settings.savedVoiceSpeed,
    thinking: settings.thinking,
    turnDetection: settings.savedTurnDetection,
  });

  // When a Settings bulk delete removes the in-progress live record, tear the
  // session down too (mirrors the sidebar delete-active path) so the deleted
  // conversation isn't left streaming on screen and re-saved under a fresh id.
  const onLiveRecordDeleted = useCallback(() => {
    if (voice.status === "connected") void voice.disconnect();
    voice.resetHistory();
  }, [voice]);

  const persistence = useVoicePersistence({
    liveHistory: voice.history,
    onForeignRecord,
    onLiveRecordDeleted,
  });
  const transfer = useConversationTransfer(persistence.refreshList);

  useClearViewingModeOnReset(
    persistence.activeConversationId,
    clearViewingMode,
  );

  const displayItems = useMemo(
    () => mergeVoiceHistory(persistence.savedItems, voice.history),
    [persistence.savedItems, voice.history],
  );
  const messages = useMemo(
    () => realtimeItemsToUIMessages(displayItems),
    [displayItems],
  );

  const prevItemCountRef = useRef(0);

  useEffect(() => {
    // Scroll only when a new item appears, not on every transcript delta —
    // otherwise streaming stacks overlapping smooth-scroll animations. Mirrors
    // chat's MessageList, which scrolls on new messages rather than per token.
    if (displayItems.length > prevItemCountRef.current) {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });
    }

    prevItemCountRef.current = displayItems.length;
  }, [displayItems]);

  const isConnected = voice.status === "connected";
  const isBusy =
    voice.status === "connecting" || voice.status === "disconnecting";

  const onToggleConnection = useCallback(() => {
    if (isConnected) {
      void voice.disconnect();

      return;
    }

    // Seed the new session from the full displayed transcript (saved record +
    // retained live history), not just savedItems. Autosave never refreshes
    // savedItems, so a conversation started and continued in one sitting
    // (Stop → Talk) would otherwise reconnect with no prior context.
    // displayItems already merges and dedupes the two sources.
    const seed = displayItems.length > 0 ? displayItems : undefined;

    void voice.connect(seed);
  }, [isConnected, displayItems, voice]);

  const headerInfo = useVoiceModeReporting({
    persistence,
    display,
    totalToolsCount,
    enabledToolsCount,
    setModeContext,
    activeVoice: voice.activeVoice,
    savedModel: settings.savedModel,
    savedProvider: settings.savedProvider,
  });

  return {
    voice,
    persistence,
    transfer,
    messages,
    openAiKey,
    firefoxDetected,
    historyPanelOpen,
    setHistoryPanelOpen,
    isConnected,
    isBusy,
    onToggleConnection,
    headerInfo,
  };
}
