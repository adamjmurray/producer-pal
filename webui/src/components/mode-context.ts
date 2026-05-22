// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ConversationLock } from "#webui/components/settings/LockedSettingsNotice";

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
  },
  onDeleteAllConversations: noop,
  onDeleteUnbookmarkedConversations: noop,
  activeVoice: null,
};
