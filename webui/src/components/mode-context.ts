// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ConversationLock } from "#webui/components/settings/LockedSettingsNotice";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import { type UndoDeleteReturn } from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { type ViewState } from "#webui/hooks/view-state/use-view-state";
import { type ConversationRecord } from "#webui/lib/conversation-db";
import { type UseSettingsReturn } from "#webui/types/settings";

/**
 * Props shared by every mode's top-level app component (ChatApp, VoiceApp): the
 * settings/display state, MCP status, tool counts, and the App-level callbacks
 * that open shared modals and report per-mode context. Each mode extends this
 * with its own extras (chat adds the live MCP connection handles).
 */
export interface ModeAppProps {
  settings: UseSettingsReturn;
  display: PreferencesSettings;
  viewState: ViewState;
  setViewState: (partial: Partial<ViewState>) => void;
  mcpStatus: McpStatus;
  totalToolsCount: number;
  /** Count of the conversation's pinned toolset, falling back to the setting. */
  enabledToolsCount: number;
  /** Count the current setting would enable, for the locked indicator's title. */
  defaultToolsCount: number;
  /** Whether that pinned toolset differs from the current setting. */
  enabledToolsDiverge: boolean;
  onOpenSettings: () => void;
  onOpenToolsSettings: () => void;
  onOpenConnectionSettings: () => void;
  onOpenContext: () => void;
  onForeignRecord: (record: ConversationRecord) => void;
  clearViewingMode: () => void;
  setModeContext: (ctx: ModeContext) => void;
  /** App-owned undo-delete stack, shared by both modes so a pending undo
   *  survives a chat/voice switch. */
  undoDelete: UndoDeleteReturn;
}

/** Per-mode context that App needs to render its shared SettingsScreen. The
 * active mode reports this via a callback so the modal can display the lock
 * state and route delete buttons through that mode's persistence hook. */
export interface ModeContext {
  conversationLock: ConversationLock;
  onDeleteAllConversations: () => void;
  onDeleteUnbookmarkedConversations: () => void;
  /** Voice id locked into the live RealtimeSession (voice mode only). Null in
   * chat mode and when voice mode is idle. Surfaced into the settings modal so
   * the Voice picker can warn that a mid-session edit applies on next Stop → Talk. */
  activeVoice: string | null;
}

// Placeholder before any mode reports its context. Exported so the default
// itself can be invoked from tests without contortion.
export const noop = (): void => {};

/** Sensible defaults when no mode has reported its context yet (e.g., during
 * initial render before the active mode's useEffect runs). */
export const DEFAULT_MODE_CONTEXT: ModeContext = {
  conversationLock: {
    activeModel: null,
    activeProvider: null,
    activeSmallModelMode: null,
    activeNotation: null,
    activeEnabledTools: null,
    activeMaxToolSteps: null,
  },
  onDeleteAllConversations: noop,
  onDeleteUnbookmarkedConversations: noop,
  activeVoice: null,
};
