// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AppShell,
  type ConversationPanelState,
} from "#webui/components/AppShell";
import { type ModeAppProps } from "#webui/components/mode-context";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import { resolvePanelNotification } from "#webui/hooks/chat/helpers/conversations/use-conversations-helpers";
import { type UndoDeleteReturn } from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import { RateLimitRetry } from "#webui/components/voice/RateLimitRetry";
import { VoiceControls } from "#webui/components/voice/VoiceControls";
import { VoiceTranscript } from "#webui/components/voice/VoiceTranscript";
import {
  type UseConversationSearchReturn,
  useConversationSearch,
} from "#webui/hooks/chat/helpers/conversations/use-conversation-search";
import { type useConversationTransfer } from "#webui/hooks/chat/use-conversation-transfer";
import { useVoiceModeState } from "#webui/hooks/voice/use-voice-mode-state";
import { type useVoicePersistence } from "#webui/hooks/voice/use-voice-persistence";
import { isMobile } from "#webui/utils/is-mobile";

export type VoiceAppProps = ModeAppProps;

/**
 * Voice mode UI. Backed by OpenAI Realtime or Gemini Live depending on the
 * saved provider/model — `realtimeProvider()` picks the active backend. The
 * voice hook graph lives in `useVoiceModeState`; this component is just the
 * JSX shell wrapped in AppShell.
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
    onOpenContext,
    clearViewingMode,
    undoDelete,
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

  const search = useConversationSearch(persistence.conversations);

  const conversationPanel = buildConversationPanel({
    isOpen: historyPanelOpen,
    setHistoryPanelOpen,
    persistence,
    transfer,
    isSessionActive,
    disconnect: voice.disconnect,
    resetVoiceHistory: voice.resetHistory,
    clearViewingMode,
    search,
    undoDelete,
  });

  return (
    <AppShell
      headerInfo={headerInfo}
      mcpStatus={mcpStatus}
      conversationPanel={conversationPanel}
      onOpenSettings={onOpenSettings}
      onOpenToolsSettings={onOpenToolsSettings}
      onOpenConnectionSettings={onOpenConnectionSettings}
      onOpenContext={onOpenContext}
    >
      <VoiceTranscript
        messages={messages}
        assistantThinking={voice.assistantThinking}
        isUnsupportedBrowser={isUnsupportedBrowser}
        hasVoiceKey={voiceKey != null}
        providerName={voiceProviderName}
      />

      {voice.error && (
        <div className="space-y-2 border-t border-red-300 bg-red-50 px-4 py-3 text-sm dark:border-red-700 dark:bg-red-950/30">
          <div>
            <span className="font-medium">Error: </span>
            {voice.error}
          </div>
          {voice.rateLimitedUntil != null && (
            <RateLimitRetry
              until={voice.rateLimitedUntil}
              onRetry={voice.retryResponse}
              exhausted={voice.autoRetryExhausted}
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
  search: UseConversationSearchReturn;
  undoDelete: UndoDeleteReturn;
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
    search,
    undoDelete,
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
    searchQuery: search.searchQuery,
    onSearchChange: search.setSearchQuery,
    matchedIds: search.matchedIds,
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
    // An in-flight import/export report outranks everything (it is the thing
    // the user just asked for); below that, chat's own ranking decides between
    // the undo banner and a save that was refused or failed.
    ...(transfer.notification
      ? {
          notification: transfer.notification,
          onDismissNotification: transfer.dismissNotification,
        }
      : toPanelNotification(resolvePanelNotification(undoDelete, persistence))),
  };
}

/**
 * Rename resolvePanelNotification's keys to the ones the panel props use.
 * @param resolved - The winning notification and its dismiss handler
 * @returns The same pair under the panel's prop names
 */
function toPanelNotification(resolved: {
  notification: TransferNotificationData | null;
  dismissNotification: () => void;
}): {
  notification: TransferNotificationData | null;
  onDismissNotification: () => void;
} {
  return {
    notification: resolved.notification,
    onDismissNotification: resolved.dismissNotification,
  };
}
