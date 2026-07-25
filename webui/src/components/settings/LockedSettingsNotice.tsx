// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Notation, NOTATION_LABELS } from "#src/shared/notation";
import { getProviderName } from "#webui/components/chat/controls/header/header-helpers";
import { getModelName } from "#webui/lib/config";
import { type Provider } from "#webui/types/settings";

/** Locked conversation state: model/provider/small-model mode/notation from the active conversation */
export interface ConversationLock {
  activeModel: string | null;
  activeProvider: Provider | null;
  activeSmallModelMode: boolean | null;
  activeNotation: Notation | null;
}

interface LockedSettingsNoticeProps {
  conversationLock: ConversationLock;
  model: string;
  provider: Provider;
  smallModelMode: boolean;
  notation: Notation;
}

/**
 * Notice shown in settings when locked conversation settings diverge from defaults.
 * Only renders when the active conversation's model, provider, small model mode,
 * or notation differs from current settings.
 * @param props - Component props
 * @param props.conversationLock - Locked state from the active conversation
 * @param props.model - Current default model from settings
 * @param props.provider - Current default provider from settings
 * @param props.smallModelMode - Current small model mode setting
 * @param props.notation - Current notation setting
 * @returns Notice element or null
 */
export function LockedSettingsNotice({
  conversationLock,
  model,
  provider,
  smallModelMode,
  notation,
}: LockedSettingsNoticeProps) {
  const { activeModel, activeProvider, activeSmallModelMode, activeNotation } =
    conversationLock;

  if (activeModel == null) return null;

  const modelDiverges = activeModel !== model || activeProvider !== provider;
  const smallModelDiverges = activeSmallModelMode !== smallModelMode;
  // Null only for a legacy record saved before notation was locked; there is
  // nothing to compare against, so stay quiet rather than claim a divergence.
  const notationDiverges =
    activeNotation != null && activeNotation !== notation;

  if (!modelDiverges && !smallModelDiverges && !notationDiverges) return null;

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

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
      <p>Changes apply to new conversations only.</p>
      <p className="mt-1 text-xs opacity-80">
        Current conversation uses {parts.join(" · ")}
      </p>
    </div>
  );
}
