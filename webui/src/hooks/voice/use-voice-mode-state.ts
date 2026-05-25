// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import { type ModeContext } from "#webui/components/mode-context";
import { useConversationTransfer } from "#webui/hooks/chat/use-conversation-transfer";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { useClearViewingModeOnReset } from "#webui/hooks/view-state/use-clear-viewing-mode-on-reset";
import { type ViewState } from "#webui/hooks/view-state/use-view-state";
import { useGeminiVoiceSession } from "#webui/hooks/voice/gemini/use-gemini-voice-session";
import { realtimeItemsToUIMessages } from "#webui/hooks/voice/realtime-items-to-ui-messages";
import { useVoiceModeReporting } from "#webui/hooks/voice/use-voice-mode-reporting";
import { useVoicePersistence } from "#webui/hooks/voice/use-voice-persistence";
import { mergeVoiceHistory } from "#webui/hooks/voice/use-voice-persistence-helpers";
import { useVoiceSession } from "#webui/hooks/voice/use-voice-session";
import {
  DEFAULT_GEMINI_REALTIME_VOICE,
  DEFAULT_REALTIME_VOICE,
  isGeminiRealtimeModelId,
  isValidGeminiRealtimeVoice,
  isValidRealtimeVoice,
  realtimeProvider,
  resolveRealtimeModel,
} from "#webui/lib/constants/models";
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
  const geminiTokenUrl = useMemo(
    () => mcpUrl.replace(/\/mcp$/, "/gemini-voice-token"),
    [mcpUrl],
  );
  // Which realtime backend the saved selection runs on. Voice is OpenAI OR
  // Gemini; the inactive backend's hook stays idle (its key is null below).
  const backend = realtimeProvider(settings.savedProvider, settings.savedModel);
  const isGemini = backend === "gemini";
  const openAiKey =
    settings.provider === "openai" && settings.apiKey ? settings.apiKey : null;
  const geminiKey =
    settings.provider === "gemini" && settings.apiKey ? settings.apiKey : null;
  // The realtime model the active voice session runs on (the saved selection
  // when it's realtime, else the provider default). Threaded into the session,
  // ephemeral token, saved record, and header lock so a non-default realtime
  // model isn't mislabeled as the default.
  const realtimeModel = resolveRealtimeModel(
    settings.savedProvider,
    settings.savedModel,
  );
  // OpenAI and Gemini have disjoint voice sets but share one saved field, so
  // validate per-provider at the point of use: a voice valid for the active
  // backend passes through, anything else (a leftover cross-provider id) falls
  // back to that backend's default. Keeps the wrong voice id from ever reaching
  // a session (which would error).
  const openAiVoiceId = isValidRealtimeVoice(settings.savedRealtimeVoice)
    ? settings.savedRealtimeVoice
    : DEFAULT_REALTIME_VOICE;
  const geminiVoiceId = isValidGeminiRealtimeVoice(settings.savedRealtimeVoice)
    ? settings.savedRealtimeVoice
    : DEFAULT_GEMINI_REALTIME_VOICE;
  // The voice the active backend will actually use — drives the header/controls
  // "pending change" comparison so it reflects the real (validated) voice.
  const activeVoiceId = isGemini ? geminiVoiceId : openAiVoiceId;
  // Firefox can't drive OpenAI's WebRTC transport, but Gemini's WebSocket path
  // works there — so the unsupported-browser block only applies to OpenAI.
  const firefoxDetected = useMemo(() => isFirefox(), []);
  const isUnsupportedBrowser = firefoxDetected && !isGemini;
  const voiceKey = isGemini ? geminiKey : openAiKey;
  const voiceProviderName = isGemini ? "Gemini" : "OpenAI";
  const historyPanelOpen = viewState.historyPanelOpen;
  const setHistoryPanelOpen = useCallback(
    (updater: (open: boolean) => boolean) => {
      setViewState({ historyPanelOpen: updater(historyPanelOpen) });
    },
    [historyPanelOpen, setViewState],
  );

  // Both backend hooks are always called (rules of hooks); the inactive one gets
  // a null key, so its connect() short-circuits and it never opens a socket/mic.
  // App routes to VoiceApp only for a realtime selection, so `backend` picks the
  // live one here.
  const openAiVoice = useVoiceSession({
    mcpUrl,
    voiceTokenUrl,
    openAiKey,
    model: realtimeModel,
    enabledTools: settings.enabledTools,
    voice: openAiVoiceId,
    speed: settings.savedVoiceSpeed,
    // Live (not saved): volume changes take effect during the active session.
    volume: settings.voiceVolume,
    thinking: settings.savedThinking,
    turnDetection: settings.savedTurnDetection,
  });
  const geminiVoiceSession = useGeminiVoiceSession({
    mcpUrl,
    voiceTokenUrl: geminiTokenUrl,
    geminiKey,
    model: realtimeModel,
    enabledTools: settings.enabledTools,
    voice: geminiVoiceId,
    volume: settings.voiceVolume,
    turnDetection: settings.savedTurnDetection.gemini,
  });
  const voice = isGemini ? geminiVoiceSession : openAiVoice;

  // When a Settings bulk delete removes the in-progress live record, tear the
  // session down too (mirrors the sidebar delete-active path) so the deleted
  // conversation isn't left streaming on screen and re-saved under a fresh id.
  // Tear down for any non-idle session, not just "connected": a session still
  // "connecting" would otherwise finish its handshake and open WebRTC + mic
  // after the record it belongs to is gone.
  const onLiveRecordDeleted = useCallback(() => {
    if (voice.status !== "idle") void voice.disconnect();
    voice.resetHistory();
  }, [voice]);

  const persistence = useVoicePersistence({
    liveHistory: voice.history,
    model: realtimeModel,
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
  // True whenever a session exists or is forming. Sidebar New/Select/Delete gate
  // their teardown on this (not just isConnected) so navigating away mid-connect
  // cancels the in-flight handshake instead of leaving an orphaned live session.
  const isSessionActive = voice.status !== "idle";

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

  // Header lock shows the model the loaded record was recorded with (when
  // viewing/continuing a saved conversation), falling back to the current
  // session model for a fresh session. The live session still runs on
  // realtimeModel; only the displayed/saved label tracks the record.
  const headerModel = persistence.activeRecordModel ?? realtimeModel;
  // Derive the brand from the header model itself (not the saved selection) so a
  // saved Gemini record reads "Google" even if the user later switched provider.
  const headerProvider = isGeminiRealtimeModelId(headerModel)
    ? "gemini"
    : "openai";

  const headerInfo = useVoiceModeReporting({
    persistence,
    display,
    totalToolsCount,
    enabledToolsCount,
    setModeContext,
    activeVoice: voice.activeVoice,
    activeModel: headerModel,
    savedModel: settings.savedModel,
    savedProvider: settings.savedProvider,
    activeProvider: headerProvider,
  });

  return {
    voice,
    persistence,
    transfer,
    messages,
    /** Active backend's API key (OpenAI or Gemini), or null when unconfigured. */
    voiceKey,
    /** Name of the active voice provider, for key-required messaging. */
    voiceProviderName,
    /** Validated voice id the active backend uses (provider-aware), for the
     * controls' pending-change comparison. */
    activeVoiceId,
    /** True only when the browser can't drive the active backend (Firefox +
     * OpenAI WebRTC; Gemini's WebSocket works in Firefox). */
    isUnsupportedBrowser,
    historyPanelOpen,
    setHistoryPanelOpen,
    isConnected,
    isBusy,
    isSessionActive,
    onToggleConnection,
    headerInfo,
  };
}
