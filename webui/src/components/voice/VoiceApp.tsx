// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AppShell,
  type ConversationPanelState,
} from "#webui/components/AppShell";
import { type ModeContext } from "#webui/components/mode-context";
import { RateLimitRetry } from "#webui/components/voice/RateLimitRetry";
import { VoiceControls } from "#webui/components/voice/VoiceControls";
import { VoiceTranscript } from "#webui/components/voice/VoiceTranscript";
import { type useConversationTransfer } from "#webui/hooks/chat/use-conversation-transfer";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { type ViewState } from "#webui/hooks/view-state/use-view-state";
import { useVoiceModeState } from "#webui/hooks/voice/use-voice-mode-state";
import { type useVoicePersistence } from "#webui/hooks/voice/use-voice-persistence";
import { type ConversationRecord } from "#webui/lib/conversation-db";
import { type UseSettingsReturn } from "#webui/types/settings";
import { isMobile } from "#webui/utils/is-mobile";

export interface VoiceAppProps {
  settings: UseSettingsReturn;
  display: PreferencesSettings;
  viewState: ViewState;
  setViewState: (partial: Partial<ViewState>) => void;
  mcpStatus: McpStatus;
  totalToolsCount: number;
  enabledToolsCount: number;
  onOpenSettings: () => void;
  onOpenToolsSettings: () => void;
  onOpenConnectionSettings: () => void;
  onForeignRecord: (record: ConversationRecord) => void;
  clearViewingMode: () => void;
  setModeContext: (ctx: ModeContext) => void;
}

/**
 * Voice mode: OpenAI Realtime API voice UI. The voice hook graph lives in
 * `useVoiceModeState`; this component is just the JSX shell wrapped in
 * AppShell.
 *
 * @param props - VoiceAppProps
 * @returns Voice screen wrapped in AppShell
 */
export function VoiceApp(props: VoiceAppProps) {
  const {
    mcpStatus,
    onOpenSettings,
    onOpenToolsSettings,
    onOpenConnectionSettings,
    clearViewingMode,
  } = props;

  const {
    voice,
    persistence,
    transfer,
    messages,
    voiceKey,
    voiceProviderName,
    isUnsupportedBrowser,
    activeVoiceId,
    historyPanelOpen,
    setHistoryPanelOpen,
    isConnected,
    isBusy,
    isSessionActive,
    onToggleConnection,
    headerInfo,
  } = useVoiceModeState(props);

  // The validated voice the active backend will use (provider-aware), not the
  // raw shared saved field — so the controls' pending-change notice is accurate.
  const savedVoice = activeVoiceId;

  const conversationPanel = buildConversationPanel({
    isOpen: historyPanelOpen,
    setHistoryPanelOpen,
    persistence,
    transfer,
    isSessionActive,
    disconnect: voice.disconnect,
    resetVoiceHistory: voice.resetHistory,
    clearViewingMode,
  });

  return (
    <AppShell
      headerInfo={headerInfo}
      mcpStatus={mcpStatus}
      conversationPanel={conversationPanel}
      onOpenSettings={onOpenSettings}
      onOpenToolsSettings={onOpenToolsSettings}
      onOpenConnectionSettings={onOpenConnectionSettings}
    >
      <VoiceTranscript
        messages={messages}
        assistantThinking={voice.assistantThinking}
        isUnsupportedBrowser={isUnsupportedBrowser}
        hasVoiceKey={voiceKey != null}
        providerName={voiceProviderName}
      />

      {voice.error && (
        <div className="border-t border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm space-y-2">
          <div>
            <span className="font-medium">Error: </span>
            {voice.error}
          </div>
          {voice.rateLimitedUntil != null && (
            <RateLimitRetry
              until={voice.rateLimitedUntil}
              onRetry={voice.retryResponse}
            />
          )}
        </div>
      )}

      <VoiceControls
        voice={voice}
        voiceKey={voiceKey}
        isBusy={isBusy}
        isConnected={isConnected}
        isUnsupportedBrowser={isUnsupportedBrowser}
        onToggleConnection={onToggleConnection}
        savedVoice={savedVoice}
        thinking={props.settings.thinking}
        onThinkingChange={props.settings.setThinking}
      />
    </AppShell>
  );
}

// --- Helpers below main export ---

interface BuildConversationPanelParams {
  isOpen: boolean;
  setHistoryPanelOpen: (updater: (open: boolean) => boolean) => void;
  persistence: ReturnType<typeof useVoicePersistence>;
  transfer: ReturnType<typeof useConversationTransfer>;
  /** True for any non-idle session (connecting included), so navigating away
   * mid-connect cancels the handshake instead of orphaning a live session. */
  isSessionActive: boolean;
  disconnect: () => Promise<void>;
  resetVoiceHistory: () => void;
  clearViewingMode: () => void;
}

/**
 * Compose the AppShell conversation-panel state object from the voice page's
 * persistence + transfer hooks.
 *
 * @param params - Panel state dependencies
 * @returns ConversationPanelState ready to hand to AppShell
 */
function buildConversationPanel(
  params: BuildConversationPanelParams,
): ConversationPanelState {
  const {
    isOpen,
    setHistoryPanelOpen,
    persistence,
    transfer,
    isSessionActive,
  } = params;

  // On phones the panel overlays the screen, so collapse it after picking or
  // creating a conversation (matches chat's useConversationPanelState).
  const closeOnMobile = () => {
    if (isMobile()) setHistoryPanelOpen(() => false);
  };

  return {
    isOpen,
    conversations: persistence.conversations,
    activeConversationId: persistence.activeConversationId,
    onToggle: () => setHistoryPanelOpen((open) => !open),
    onNew: () => {
      if (isSessionActive) void params.disconnect();
      params.resetVoiceHistory();
      persistence.startNewConversation();
      params.clearViewingMode();
      closeOnMobile();
    },
    onSelect: (id) => {
      if (isSessionActive) void params.disconnect();
      params.resetVoiceHistory();
      void persistence.switchConversation(id);
      closeOnMobile();
    },
    onDelete: (id) => {
      // Stop the session when deleting the conversation you're actively talking
      // in, so it stops streaming new transcript. Gate on isSessionActive (not
      // just connected) so a delete during the connect handshake cancels it
      // too. (deleteConversation also guards autosave against resurrecting a
      // deleted record, covering a save that was already in flight when the
      // delete landed.)
      if (id === persistence.activeConversationId && isSessionActive) {
        void params.disconnect();
        params.resetVoiceHistory();
      }

      void persistence.deleteConversation(id);
    },
    onExportItem: transfer.handleExportOne,
    onRename: (id, title) => void persistence.renameConversation(id, title),
    onToggleBookmark: (id) => void persistence.toggleBookmark(id),
    onExport: () => void transfer.handleExport(),
    onImport: () => void transfer.handleImport(),
    notification: transfer.notification,
    onDismissNotification: transfer.dismissNotification,
  };
}
