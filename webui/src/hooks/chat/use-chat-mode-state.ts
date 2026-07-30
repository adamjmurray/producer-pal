// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { type ModeContext } from "#webui/components/mode-context";
import { chatAdapter } from "#webui/hooks/chat/adapter";
import { useChatModeReporting } from "#webui/hooks/chat/helpers/use-chat-mode-reporting";
import { useConversationHandlers } from "#webui/hooks/chat/helpers/use-conversation-handlers";
import { useConversationLock } from "#webui/hooks/chat/helpers/use-conversation-lock";
import { useConversationPanelState } from "#webui/hooks/chat/helpers/use-conversation-panel-state";
import { useChat } from "#webui/hooks/chat/use-chat";
import { type PendingFork } from "#webui/hooks/chat/use-chat-types";
import { useConversationTransfer } from "#webui/hooks/chat/use-conversation-transfer";
import { useConversations } from "#webui/hooks/chat/use-conversations";
import {
  type McpStatus,
  type McpTool,
} from "#webui/hooks/connection/use-mcp-connection";
import { type UseRemoteConfigReturn } from "#webui/hooks/connection/use-remote-config";
import { useSyncSmallModelMode } from "#webui/hooks/connection/use-sync-small-model-mode";
import { useSystemPrompt } from "#webui/hooks/context/use-system-prompt";
import {
  resolveSubagentPreset,
  SUBAGENT_PRESET_PARAM,
} from "#webui/hooks/settings/presets/preset-extra-params";
import {
  loadPresets,
  PRESETS_STORAGE_KEY,
} from "#webui/hooks/settings/presets/preset-storage";
import { useFirstSendGate } from "#webui/hooks/use-first-send-gate";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { useClearViewingModeOnReset } from "#webui/hooks/view-state/use-clear-viewing-mode-on-reset";
import { type ViewState } from "#webui/hooks/view-state/use-view-state";
import { resolveSystemInstruction } from "#webui/lib/config";
import {
  type BranchNavState,
  type BranchPoint,
  computeBranchPoints,
} from "#webui/lib/conversation-branch-helpers";
import {
  type ConversationRecord,
  listAllConversationSummaries,
} from "#webui/lib/conversation-db";
import { type Provider, type UseSettingsReturn } from "#webui/types/settings";
import { getBaseUrl, resolveProviderApiKey } from "#webui/utils/provider-url";

export interface UseChatModeStateParams {
  settings: UseSettingsReturn;
  display: PreferencesSettings;
  viewState: ViewState;
  setViewState: (partial: Partial<ViewState>) => void;
  mcpStatus: McpStatus;
  mcpError: string | null;
  mcpTools?: McpTool[] | null;
  checkMcpConnection: () => Promise<void>;
  remoteConfig: UseRemoteConfigReturn;
  totalToolsCount: number;
  enabledToolsCount: number;
  onForeignRecord: (record: ConversationRecord) => void;
  clearViewingMode: () => void;
  setModeContext: (ctx: ModeContext) => void;
}

/**
 * Composes the chat-mode hook graph (chat, conversation manager, transfer,
 * panel state) and reports the active session's lock + delete handlers up to
 * App via setModeContext. Pulled out of ChatApp purely so ChatApp's main
 * function stays under the size limit.
 *
 * @param params - Chat-mode hook inputs
 * @returns Chat state + handlers ready for ChatScreen
 */
export function useChatModeState(params: UseChatModeStateParams) {
  const {
    settings,
    display,
    viewState,
    setViewState,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    remoteConfig,
    totalToolsCount,
    enabledToolsCount,
    onForeignRecord,
    clearViewingMode,
    setModeContext,
  } = params;

  const autoSaveRef = useRef<(() => void) | null>(null);
  // Bridges the fork action (in useChat) to the conversation save (in
  // useConversations): set right before a forked turn streams, consumed by the
  // next save to branch the record instead of overwriting it.
  const pendingForkRef = useRef<PendingFork | null>(null);

  // The user's custom system prompt (~/.producer-pal/system-prompt.md). When
  // non-empty it fully replaces the built-in instruction for each new
  // conversation (locked at client init; see the adapter). Editing it in the
  // Instructions tab converges here via useDoc's focus/poll refresh.
  const systemPromptDoc = useSystemPrompt();
  const systemInstructionOverride =
    systemPromptDoc.status.kind === "ready"
      ? systemPromptDoc.status.content
      : "";
  // The instruction actually in effect (override or built-in): sent by the
  // adapter, snapshotted onto saved records, and shown in the transcript notice.
  const effectiveSystemInstruction = resolveSystemInstruction(
    systemInstructionOverride,
  );

  const baseUrl = getBaseUrl(settings.provider, settings.baseUrl);
  const resolvedApiKey = resolveProviderApiKey(
    settings.provider,
    settings.apiKey,
  );

  // Resolve a provider's connection (key + base URL) from current settings.
  // useChat calls this at client-init time with the conversation's *locked*
  // provider so a restored conversation reconnects with the current credentials
  // for its own provider — not whichever provider is selected right now. For the
  // active provider it returns the same values as the new-conversation path.
  const { getProviderConnection } = settings;
  const resolveConnection = useCallback(
    (targetProvider: Provider): { apiKey: string; baseUrl?: string } => {
      const conn = getProviderConnection(targetProvider);

      return {
        apiKey: resolveProviderApiKey(targetProvider, conn.apiKey),
        baseUrl: getBaseUrl(targetProvider, conn.baseUrl),
      };
    },
    [getProviderConnection],
  );

  // Resolve the chosen "Default subagent" preset. Read the presets blob fresh
  // each render (a usePresets snapshot would go stale — presets are edited in a
  // separate hook instance), but key the actual parse/validate/resolve off that
  // blob so it only recomputes when the presets or the selection change:
  // useChatModeState re-renders per streamed token, so this avoids a JSON.parse +
  // validation + allocation on every chunk. Undefined = inherit; the adapter
  // turns it into the worker override.
  const presetsBlob = localStorage.getItem(PRESETS_STORAGE_KEY);
  const subagentPreset = useMemo(
    () =>
      resolveSubagentPreset(
        settings.defaultSubagentPresetId,
        presetsBlob ? loadPresets() : [],
        resolveConnection,
      ),
    [presetsBlob, settings.defaultSubagentPresetId, resolveConnection],
  );

  const aiSdkChat = useChat({
    provider: settings.provider,
    apiKey: resolvedApiKey,
    model: settings.model,
    thinking: settings.thinking,
    enabledTools: settings.enabledTools,
    smallModelMode: settings.smallModelMode,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    resolveConnection,
    adapter: chatAdapter,
    extraParams: {
      baseUrl,
      smallModelMode: settings.smallModelMode,
      provider: settings.provider,
      apiKey: resolvedApiKey,
      systemInstructionOverride,
      // The notation a NEW conversation locks and then sends on every request.
      // This is the value the Tools tab is showing, seeded from the device
      // global — so the chat runs the notation the user can see, and changing it
      // no longer reaches back into conversations already in flight. A restored
      // conversation ignores this in favor of its own locked snapshot. The first
      // send is gated below until this is a real answer rather than the
      // provisional mount-time default.
      notation: settings.notation,
      [SUBAGENT_PRESET_PARAM]: subagentPreset,
    },
    autoSaveRef,
    pendingForkRef,
  });

  const { chat, wrappedHandleSend, wrappedClearConversation } =
    useConversationLock({ chat: aiSdkChat });

  // Hold the first send until everything it LOCKS has finished loading: the
  // custom system prompt (else a turn fired during the fetch locks the built-in
  // instruction when the user has an override) and the notation (else it locks
  // the provisional default and teaches the wrong grammar for the whole
  // conversation). Transparent once both have resolved.
  const gatedHandleSend = useFirstSendGate(
    systemPromptDoc.status.kind === "loading" || !settings.notationKnown,
    wrappedHandleSend,
  );

  useSyncSmallModelMode(
    remoteConfig.serverSmallModelMode,
    chat.activeSmallModelMode,
    settings.setSmallModelMode,
    remoteConfig.postSmallModelMode,
  );

  const conversationManager = useConversations({
    getChatHistory: chat.getChatHistory,
    restoreChatHistory: chat.restoreChatHistory,
    clearConversation: wrappedClearConversation,
    activeMeta: {
      activeModel: chat.activeModel,
      activeProvider: chat.activeProvider,
      activeThinking: chat.activeThinking,
      activeSmallModelMode: chat.activeSmallModelMode,
      // Snapshot the LOCKED instruction (what this conversation actually ran
      // with), not the current global override — so editing the global later
      // doesn't rewrite an existing conversation's record. Same for notation.
      activeSystemInstruction: chat.activeSystemInstruction,
      activeNotation: chat.activeNotation,
      // The toolset the live client was built with, which is the current one —
      // recorded so a later restore can tell the user the tools have moved.
      activeEnabledTools: chat.activeEnabledTools,
    },
    onForeignRecord,
    pendingForkRef,
  });

  useEffect(() => {
    /* v8 ignore start -- auto-save ref: only invoked during streaming */
    autoSaveRef.current = () =>
      void conversationManager.saveCurrentConversation(Date.now());
    /* v8 ignore stop */
  }, [conversationManager]);

  useClearViewingModeOnReset(
    conversationManager.activeConversationId,
    clearViewingMode,
  );

  const transfer = useConversationTransfer(conversationManager.refreshList);
  const conversationHandlers = useConversationHandlers(
    conversationManager,
    chat.stopResponse,
    clearViewingMode,
  );

  const conversationPanelState = useConversationPanelState({
    conversationManager,
    transfer,
    viewState,
    setViewState,
    handlers: conversationHandlers,
  });

  const prevRespondingRef = useRef(false);

  useEffect(() => {
    if (!chat.isAssistantResponding && prevRespondingRef.current) {
      void conversationManager.saveCurrentConversation(Date.now());
    }

    prevRespondingRef.current = chat.isAssistantResponding;
  }, [chat.isAssistantResponding, conversationManager]);

  const headerInfo = useChatModeReporting({
    chat,
    settings,
    display,
    enabledToolsCount,
    totalToolsCount,
    handleDeleteAll: conversationHandlers.handleDeleteAll,
    handleDeleteUnbookmarked: conversationHandlers.handleDeleteUnbookmarked,
    setModeContext,
  });

  // Sibling-branch arrows for the active conversation. Recomputes when the
  // active conversation or the list changes (a fork was created/deleted).
  const branchPoints = useBranchNav(
    conversationManager.activeConversationId,
    conversationManager.conversations,
  );
  const branchNav: BranchNavState = {
    points: branchPoints,
    onSwitch: conversationManager.switchConversation,
  };

  return {
    chat,
    wrappedHandleSend: gatedHandleSend,
    conversationPanelState,
    headerInfo,
    branchNav,
    // Show the LOCKED instruction for the active conversation (accurate once a
    // chat has sent its first turn). Fall back to the current resolved
    // instruction when none is locked — a brand-new not-yet-locked chat, or a
    // pre-1.5 conversation restored from before instruction-locking existed.
    // Legacy records never stored their instruction, so it can't be recovered:
    // the current one is the only sane default to display and to continue with,
    // even though it may not match what that old chat originally used.
    systemInstruction:
      chat.activeSystemInstruction ?? effectiveSystemInstruction,
  };
}

/**
 * Compute the branch points (sibling-paging arrow positions) for the active
 * conversation. Reads the full, uncollapsed conversation list so every sibling
 * is visible, and recomputes whenever the active conversation changes or the
 * list refreshes (a fork was created or deleted). The branch family is small and
 * the list is capped, so the read is cheap.
 * @param activeConversationId - Id of the conversation currently being viewed
 * @param refreshSignal - Any value that changes when the conversation list does;
 *   used only to retrigger the computation (e.g. the collapsed summary array)
 * @returns Branch points for the active conversation (empty when none)
 */
export function useBranchNav(
  activeConversationId: string | null,
  refreshSignal: unknown,
): BranchPoint[] {
  const [points, setPoints] = useState<BranchPoint[]>([]);

  useEffect(() => {
    if (activeConversationId == null) {
      setPoints([]);

      return;
    }

    let cancelled = false;

    void listAllConversationSummaries().then((summaries) => {
      if (cancelled) return;

      setPoints(computeBranchPoints(activeConversationId, summaries));
    });

    return () => {
      cancelled = true;
    };
    // refreshSignal is a deliberate retrigger input, not read in the body.
  }, [activeConversationId, refreshSignal]);

  return points;
}
