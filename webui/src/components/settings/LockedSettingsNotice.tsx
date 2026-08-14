// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Notation, NOTATION_LABELS } from "#src/shared/notation";
import { getProviderName } from "#webui/components/chat/controls/header/header-helpers";
import { getModelName } from "#webui/lib/config";
import {
  enabledToolsDiverge,
  withLiveApiTool,
} from "#webui/lib/utils/enabled-tools";
import { type Provider } from "#webui/types/settings";

/** Locked conversation state: model/provider/small-model mode/notation/toolset from the active conversation */
export interface ConversationLock {
  activeModel: string | null;
  activeProvider: Provider | null;
  activeSmallModelMode: boolean | null;
  activeNotation: Notation | null;
  activeEnabledTools: Record<string, boolean> | null;
}

interface LockedSettingsNoticeProps {
  conversationLock: ConversationLock;
  model: string;
  provider: Provider;
  smallModelMode: boolean;
  notation: Notation;
  enabledTools: Record<string, boolean>;
  liveApiEnabled: boolean;
}

/**
 * Notice shown in settings when the active conversation's settings diverge from
 * the current defaults — model, provider, small model mode, notation, or the
 * toolset. All of them are pinned for the conversation's lifetime, so the notice
 * says the same thing about each: this takes effect on the next conversation.
 * @param props - Component props
 * @param props.conversationLock - Locked state from the active conversation
 * @param props.model - Current default model from settings
 * @param props.provider - Current default provider from settings
 * @param props.smallModelMode - Current small model mode setting
 * @param props.notation - Current notation setting
 * @param props.enabledTools - Current tool selection
 * @param props.liveApiEnabled - Current Direct Live API flag (the modal's buffer)
 * @returns Notice element or null
 */
export function LockedSettingsNotice({
  conversationLock,
  model,
  provider,
  smallModelMode,
  notation,
  enabledTools,
  liveApiEnabled,
}: LockedSettingsNoticeProps) {
  const {
    activeModel,
    activeProvider,
    activeSmallModelMode,
    activeNotation,
    activeEnabledTools,
  } = conversationLock;

  if (activeModel == null) return null;

  const modelDiverges = activeModel !== model || activeProvider !== provider;
  const smallModelDiverges = activeSmallModelMode !== smallModelMode;
  // Null only for a legacy record saved before notation was locked; there is
  // nothing to compare against, so stay quiet rather than claim a divergence.
  const notationDiverges =
    activeNotation != null && activeNotation !== notation;
  // Same for the toolset, which is likewise absent on records saved before it
  // was locked (those reconnect on the current selection, so stay quiet).
  // Both sides take the Live API stamp, as in App's tools indicator: the
  // selection carries no entry for it (its checkbox flips the device flag), so
  // unstamped it reads as enabled and a conversation pinned while the flag was
  // ON looks unchanged after the flag goes off. The flag here is the modal's
  // buffer, not the server value App stamps with — like every other field in
  // this notice, which is about the selection the user is looking at, so
  // unchecking the box says so before the save lands.
  const toolsDiverge =
    activeEnabledTools != null &&
    enabledToolsDiverge(
      withLiveApiTool(activeEnabledTools, liveApiEnabled),
      withLiveApiTool(enabledTools, liveApiEnabled),
    );

  if (
    !modelDiverges &&
    !smallModelDiverges &&
    !notationDiverges &&
    !toolsDiverge
  ) {
    return null;
  }

  const parts: string[] = [];

  if (modelDiverges) {
    parts.push(
      `${getProviderName(activeProvider ?? provider)} | ${getModelName(activeModel)}`,
    );
  }

  if (smallModelDiverges) {
    parts.push(activeSmallModelMode ? "small model mode" : "large model mode");
  }

  if (notationDiverges) {
    parts.push(`${NOTATION_LABELS[activeNotation]} notation`);
  }

  if (toolsDiverge) {
    parts.push("a different set of tools");
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <p>Changes apply to new conversations only.</p>

      {/* Every divergence above contributes a part, so this line always has
          something to say by the time we get here. */}
      <p className="mt-1 text-xs opacity-80">
        Current conversation uses {parts.join(" · ")}
      </p>
    </div>
  );
}
