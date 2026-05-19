// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import {
  AppShell,
  type ConversationPanelState,
} from "#webui/components/AppShell";
import { type HeaderInfo } from "#webui/components/chat/controls/header/HeaderActions";
import { RateLimitRetry } from "#webui/components/voice/RateLimitRetry";
import { VoiceControls } from "#webui/components/voice/VoiceControls";
import { VoiceTranscript } from "#webui/components/voice/VoiceTranscript";
import { useConversationTransfer } from "#webui/hooks/chat/use-conversation-transfer";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import {
  loadEnabledTools,
  loadProviderSettings,
} from "#webui/hooks/settings/settings-helpers";
import { usePreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { realtimeItemsToUIMessages } from "#webui/hooks/voice/realtime-items-to-ui-messages";
import { useVoicePersistence } from "#webui/hooks/voice/use-voice-persistence";
import { mergeVoiceHistory } from "#webui/hooks/voice/use-voice-persistence-helpers";
import { useVoiceSession } from "#webui/hooks/voice/use-voice-session";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";
import { isFirefox } from "#webui/utils/browser-detect";
import { getMcpUrl } from "#webui/utils/mcp-url";

// Voice still lives on its own /voice route in this commit, so the header's
// settings buttons can't open a modal here. Route to /chat instead — that's
// already where the OpenAI-key-required banner sends users.
const goToChat = (): void => {
  window.location.href = "/chat";
};

/**
 * Standalone Producer Pal voice page. Reuses the chat UI's localStorage
 * settings (OpenAI API key + per-tool enable map) and the MCP URL helper.
 *
 * @returns Voice prototype UI
 */
export function VoiceApp() {
  const mcpUrl = getMcpUrl();
  const voiceTokenUrl = mcpUrl.replace(/\/mcp$/, "/voice-token");
  const { mcpStatus, mcpTools } = useMcpConnection();
  const preferences = usePreferencesSettings();

  const [openAiKey] = useState<string | null>(
    () => loadProviderSettings("openai").apiKey || null,
  );
  const enabledTools = useMemo(() => loadEnabledTools(), []);
  const firefoxDetected = useMemo(() => isFirefox(), []);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);

  const voice = useVoiceSession({
    mcpUrl,
    voiceTokenUrl,
    openAiKey,
    enabledTools,
  });

  const persistence = useVoicePersistence({ liveHistory: voice.history });
  const transfer = useConversationTransfer(persistence.refreshList);

  // Merge the saved record (with historical tool calls) with the live session
  // history. When no session is running, this is just the saved items. During
  // a continued session, this preserves the visual record of prior tool calls
  // — the Realtime SDK can't re-seed function_call items so they'd otherwise
  // disappear from view the moment the user clicks Talk.
  const displayItems = useMemo(
    () => mergeVoiceHistory(persistence.savedItems, voice.history),
    [persistence.savedItems, voice.history],
  );
  const messages = useMemo(
    () => realtimeItemsToUIMessages(displayItems),
    [displayItems],
  );

  useEffect(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  }, [displayItems]);

  const isBusy =
    voice.status === "connecting" || voice.status === "disconnecting";
  const isConnected = voice.status === "connected";
  const isUnsupportedBrowser = firefoxDetected;

  const onToggleConnection = useCallback(() => {
    if (isConnected) {
      void voice.disconnect();

      return;
    }

    // If a saved voice conversation is loaded, prime the new session with its
    // messages so the model has prior context. Function calls are dropped by
    // the SDK during priming but stay visible in the saved record via the
    // merge in displayItems / persistence's auto-save.
    const seed =
      persistence.savedItems.length > 0 ? persistence.savedItems : undefined;

    void voice.connect(seed);
  }, [isConnected, persistence.savedItems, voice]);

  const totalToolsCount = mcpTools?.length ?? 0;
  const enabledToolsCount = mcpTools
    ? mcpTools.filter((t) => enabledTools[t.id] !== false).length
    : 0;

  const headerInfo: HeaderInfo = {
    activeModel: OPENAI_REALTIME_MODEL,
    activeProvider: "openai",
    model: OPENAI_REALTIME_MODEL,
    provider: "openai",
    enabledToolsCount,
    totalToolsCount,
    smallModelMode: false,
    defaultSmallModelMode: false,
    showHelpLinks: preferences.showHelpLinks,
  };

  const conversationPanel = buildConversationPanel({
    isOpen: historyPanelOpen,
    setHistoryPanelOpen,
    persistence,
    transfer,
    isConnected,
    disconnect: voice.disconnect,
  });

  return (
    <AppShell
      headerInfo={headerInfo}
      mcpStatus={mcpStatus}
      conversationPanel={conversationPanel}
      onOpenSettings={goToChat}
      onOpenToolsSettings={goToChat}
      onOpenConnectionSettings={goToChat}
    >
      <VoiceTranscript
        messages={messages}
        assistantThinking={voice.assistantThinking}
        firefoxDetected={firefoxDetected}
        hasOpenAiKey={openAiKey != null}
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
        openAiKey={openAiKey}
        isBusy={isBusy}
        isConnected={isConnected}
        isUnsupportedBrowser={isUnsupportedBrowser}
        onToggleConnection={onToggleConnection}
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
  isConnected: boolean;
  disconnect: () => Promise<void>;
}

/**
 * Compose the AppShell conversation-panel state object from the voice page's
 * persistence + transfer hooks. Pulled out of VoiceApp purely to keep its
 * main function under the line limit.
 *
 * @param params - Panel state dependencies
 * @returns ConversationPanelState ready to hand to AppShell
 */
function buildConversationPanel(
  params: BuildConversationPanelParams,
): ConversationPanelState {
  const { isOpen, setHistoryPanelOpen, persistence, transfer, isConnected } =
    params;

  return {
    isOpen,
    conversations: persistence.conversations,
    activeConversationId: persistence.activeConversationId,
    onToggle: () => setHistoryPanelOpen((open) => !open),
    onNew: () => {
      if (isConnected) void params.disconnect();
      persistence.startNewConversation();
    },
    onSelect: (id) => {
      if (isConnected) void params.disconnect();
      void persistence.switchConversation(id);
    },
    onDelete: (id) => void persistence.deleteConversation(id),
    onExportItem: transfer.handleExportOne,
    onRename: (id, title) => void persistence.renameConversation(id, title),
    onToggleBookmark: (id) => void persistence.toggleBookmark(id),
    onExport: () => void transfer.handleExport(),
    onImport: () => void transfer.handleImport(),
    notification: transfer.notification,
    onDismissNotification: transfer.dismissNotification,
  };
}
