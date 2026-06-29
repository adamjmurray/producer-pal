// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { type ModeContext } from "#webui/components/mode-context";
import { useConversationTransfer } from "#webui/hooks/chat/use-conversation-transfer";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { useClearViewingModeOnReset } from "#webui/hooks/view-state/use-clear-viewing-mode-on-reset";
import { type ViewState } from "#webui/hooks/view-state/use-view-state";
import { useGeminiVoiceSession } from "#webui/hooks/voice/gemini/use-gemini-voice-session";
import { mergeVoiceHistory } from "#webui/hooks/voice/helpers/use-voice-persistence-helpers";
import { realtimeItemsToUIMessages } from "#webui/hooks/voice/realtime-items-to-ui-messages";
import { useVoiceModeReporting } from "#webui/hooks/voice/use-voice-mode-reporting";
import { useVoicePersistence } from "#webui/hooks/voice/use-voice-persistence";
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
  // Settings-derived defaults — used when no saved record is loaded (fresh
  // session). When a record IS loaded, its stored provider/model take over
  // below so the resumed session runs on the backend the record was created
  // with, not whatever the user currently has selected in Settings.
  const settingsBackend = realtimeProvider(
    settings.savedProvider,
    settings.savedModel,
  );
  const settingsRealtimeModel = resolveRealtimeModel(
    settings.savedProvider,
    settings.savedModel,
  );
  // Persistence depends on `voice.history` (autosave debounces on it), and the
  // record-aware routing below needs persistence's loaded-record metadata
  // before the session hooks. To break that cycle, mirror voice.history into
  // state declared *before* persistence; the effect at the bottom of this hook
  // syncs voice.history → liveHistoryForSave each render. One extra render per
  // transcript update — voice.history is already chunky (item-level, not
  // per-token), so the cost is negligible.
  const [liveHistoryForSave, setLiveHistoryForSave] = useState<RealtimeItem[]>(
    [],
  );
  // `voice` is assigned below (after the session hooks) but onLiveRecordDeleted
  // — passed into persistence above the session hooks — needs to reach it.
  // Indirect through a ref containing the latest closure: the initial no-op is
  // safe before the post-mount effect installs the real handler (delete is
  // user-triggered, so always after that).
  // `Function.prototype` is a built-in no-op; using it instead of an
  // inline arrow avoids carrying an "uncovered function body" on this file.
  const onLiveRecordDeletedRef = useRef<() => void>(
    Function.prototype as () => void,
  );
  // When a Settings bulk delete removes the in-progress live record, tear the
  // session down too (mirrors the sidebar delete-active path) so the deleted
  // conversation isn't left streaming on screen and re-saved under a fresh id.
  // Tear down for any non-idle session, not just "connected": a session still
  // "connecting" would otherwise finish its handshake and open WebRTC + mic
  // after the record it belongs to is gone.
  const onLiveRecordDeleted = useCallback(() => {
    onLiveRecordDeletedRef.current();
  }, []);

  const persistence = useVoicePersistence({
    liveHistory: liveHistoryForSave,
    // Settings-derived. For an existing record, autosave preserves the record's
    // own model (existing.model wins in saveVoiceRecord), so this only takes
    // effect when stamping a brand-new record — which has no loaded record
    // anyway, so settings is the right source.
    model: settingsRealtimeModel,
    onForeignRecord,
    onLiveRecordDeleted,
  });

  // Record-aware routing: when a saved record is loaded, route on the record's
  // own provider/model (header already does this for the model label). Without
  // this a Gemini record opened while current settings select OpenAI would
  // mount the OpenAI backend with the wrong model + a missing-key state, and
  // vice versa.
  const recordModelId = persistence.activeRecordModel;
  const recordProviderId = persistence.activeRecordProvider;
  const realtimeModel = recordModelId ?? settingsRealtimeModel;
  const backend = resolveBackend(
    recordModelId,
    recordProviderId,
    settingsBackend,
  );
  const isGemini = backend === "gemini";

  // Per-provider key, read from settings regardless of which provider is
  // currently selected — so resuming an OpenAI record while settings are on
  // Gemini still sees the stored OpenAI key (and vice versa). Without this the
  // Talk button falsely reports "key required" for the record's backend.
  const openAiKey = settings.openaiApiKey || null;
  const geminiKey = settings.geminiApiKey || null;
  const voiceKey = isGemini ? geminiKey : openAiKey;

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
    language: settings.savedVoiceLanguage,
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
    language: settings.savedVoiceLanguage,
  });
  const voice = isGemini ? geminiVoiceSession : openAiVoice;

  // Wire voice.history → persistence (mirror state declared above persistence,
  // breaking the realtimeModel↔voice.history cycle) and capture the active
  // session in the deletion closure so a Settings bulk delete can tear it down.
  useEffect(() => {
    onLiveRecordDeletedRef.current = () => {
      if (voice.status !== "idle") void voice.disconnect();
      voice.resetHistory();
    };

    setLiveHistoryForSave(voice.history);
  }, [voice]);

  // Both backend hooks stay mounted, so switching the active voice provider
  // (OpenAI ↔ Gemini in Settings) only changes which one `voice` points at — it
  // does NOT tear down the one left behind. Without this, a session still live
  // on the previous backend would keep its mic + socket open with no Stop button
  // (the controls follow the now-active backend, which is idle right after a
  // switch). On a real backend flip, disconnect whichever hook just went
  // inactive if it isn't already idle. The hook objects are in the deps (fresh
  // identity each render), but the prev-backend ref makes the body act only on
  // the flip — a same-backend model change doesn't tear down the live session.
  const prevBackendRef = useRef(isGemini);

  useEffect(() => {
    if (prevBackendRef.current === isGemini) return;
    prevBackendRef.current = isGemini;
    const nowInactive = isGemini ? openAiVoice : geminiVoiceSession;

    if (nowInactive.status !== "idle") void nowInactive.disconnect();
  }, [isGemini, openAiVoice, geminiVoiceSession]);
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
    //
    // Promote that transcript into persistence's prior snapshot *before*
    // reconnecting: the reseed drops function_call items (the SDK refuses to
    // re-add them), so without this the post-reconnect autosave would merge
    // against an empty prior and overwrite the saved record's historical tool
    // calls — and they'd vanish from the transcript too. A no-op when empty
    // (a truly fresh Talk) since prior/savedItems are already empty.
    persistence.retainPriorHistory(displayItems);
    const seed = displayItems.length > 0 ? displayItems : undefined;

    void voice.connect(seed);
  }, [isConnected, displayItems, voice, persistence]);

  // `realtimeModel` and `backend` above are already record-aware (they prefer
  // the loaded record's provider/model over current settings), so the header
  // lock reads off them directly — no separate header fallback needed.
  const headerInfo = useVoiceModeReporting({
    persistence,
    display,
    totalToolsCount,
    enabledToolsCount,
    setModeContext,
    activeVoice: voice.activeVoice,
    activeModel: realtimeModel,
    savedModel: settings.savedModel,
    savedProvider: settings.savedProvider,
    activeProvider: backend,
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

// --- Helpers below main export ---

/**
 * Resolve which realtime backend the voice session should run on, preferring
 * a loaded record's metadata over current settings. The record's stored
 * `provider` field is the authoritative signal (it was derived from the
 * model's brand when the record was saved); falls back to model-id sniffing
 * when older records have no provider, then to settings for a fresh session.
 *
 * @param recordModel - Model id stored on the loaded record (null for fresh)
 * @param recordProvider - Provider stored on the loaded record (null for fresh)
 * @param settingsBackend - Backend implied by current Settings selection
 * @returns "openai" | "gemini" — the backend to mount the session on
 */
function resolveBackend(
  recordModel: string | null,
  recordProvider: string | null,
  settingsBackend: "openai" | "gemini" | null,
): "openai" | "gemini" {
  if (recordProvider === "gemini") return "gemini";
  if (recordProvider === "openai") return "openai";

  if (recordModel != null) {
    return isGeminiRealtimeModelId(recordModel) ? "gemini" : "openai";
  }

  return settingsBackend ?? "openai";
}
