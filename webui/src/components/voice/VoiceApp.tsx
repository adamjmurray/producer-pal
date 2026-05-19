// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useState } from "preact/hooks";
import {
  AppShell,
  type ConversationPanelState,
} from "#webui/components/AppShell";
import { type HeaderInfo } from "#webui/components/chat/controls/header/HeaderActions";
import { RateLimitRetry } from "#webui/components/voice/RateLimitRetry";
import { VoiceControls } from "#webui/components/voice/VoiceControls";
import { VoiceTranscript } from "#webui/components/voice/VoiceTranscript";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import {
  loadEnabledTools,
  loadProviderSettings,
} from "#webui/hooks/settings/settings-helpers";
import { usePreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { realtimeItemsToUIMessages } from "#webui/hooks/voice/realtime-items-to-ui-messages";
import { useVoiceSession } from "#webui/hooks/voice/use-voice-session";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";
import { isFirefox } from "#webui/utils/browser-detect";
import { getMcpUrl } from "#webui/utils/mcp-url";

// The conversation sidebar is a stub until commit 5 wires up voice-session
// persistence, so every handler is a no-op. TS lets us pass a zero-arg no-op
// where typed-parameter callbacks are expected, including onExportItem's
// `void | Promise<void>` return.
const noop = (): void => undefined;

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

  const messages = useMemo(
    () => realtimeItemsToUIMessages(voice.history),
    [voice.history],
  );

  useEffect(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  }, [voice.history]);

  const isBusy =
    voice.status === "connecting" || voice.status === "disconnecting";
  const isConnected = voice.status === "connected";
  const isUnsupportedBrowser = firefoxDetected;

  const onToggleConnection = () => {
    if (isConnected) {
      void voice.disconnect();
    } else {
      void voice.connect();
    }
  };

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

  const conversationPanel: ConversationPanelState = {
    isOpen: historyPanelOpen,
    conversations: [],
    activeConversationId: null,
    onToggle: () => setHistoryPanelOpen((open) => !open),
    onNew: noop,
    onSelect: noop,
    onDelete: noop,
    onExportItem: noop,
    onRename: noop,
    onToggleBookmark: noop,
    onExport: noop,
    onImport: noop,
    notification: null,
    onDismissNotification: noop,
  };

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
