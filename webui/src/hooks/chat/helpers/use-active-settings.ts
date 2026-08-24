// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "preact/hooks";
import { type Notation } from "#src/shared/notation";
import { type ConversationLockedSettings } from "#webui/hooks/chat/use-chat-types";
import { type Provider } from "#webui/types/settings";

/** State for the "locked" settings of the current conversation */
export interface ActiveSettings {
  activeModel: string | null;
  activeProvider: Provider | null;
  activeThinking: string | null;
  activeSmallModelMode: boolean | null;
  activeSystemInstruction: string | null;
  activeNotation: Notation | null;
  activeEnabledTools: Record<string, boolean> | null;
  activeMaxToolSteps: number | null;
}

/**
 * The values a conversation locks when its client is (re)initialized. Passed as
 * an object rather than positionally: there are enough same-typed fields here
 * that argument order would be easy to get wrong and impossible to read.
 */
export interface LockedSettingsInput {
  model: string;
  provider: Provider;
  thinking: string;
  smallModelMode: boolean;
  systemInstruction: string;
  notation: Notation | null;
  enabledTools: Record<string, boolean>;
  maxToolSteps: number;
}

interface ActiveSettingsActions {
  /** Lock settings when a new conversation starts */
  lockSettings: (settings: LockedSettingsInput) => void;
  /** Restore settings from a saved conversation */
  restoreSettings: (lockedSettings?: ConversationLockedSettings) => void;
  /** Clear all active settings (new conversation) */
  clearSettings: () => void;
}

export type UseActiveSettingsReturn = ActiveSettings & ActiveSettingsActions;

/**
 * Manages the "active" (locked) settings for the current conversation.
 * These values are set when a conversation starts or is restored,
 * and cleared when the conversation is reset.
 * @returns Active settings state and mutation functions
 */
export function useActiveSettings(): UseActiveSettingsReturn {
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const [activeThinking, setActiveThinking] = useState<string | null>(null);
  const [activeSmallModelMode, setActiveSmallModelMode] = useState<
    boolean | null
  >(null);
  const [activeSystemInstruction, setActiveSystemInstruction] = useState<
    string | null
  >(null);
  const [activeNotation, setActiveNotation] = useState<Notation | null>(null);
  const [activeEnabledTools, setActiveEnabledTools] = useState<Record<
    string,
    boolean
  > | null>(null);
  // Not carried on the saved record like the others: the budget doesn't change
  // what the model is told, so a restored conversation re-locks on whatever is
  // set at the time its client is built.
  const [activeMaxToolSteps, setActiveMaxToolSteps] = useState<number | null>(
    null,
  );

  const lockSettings = useCallback((settings: LockedSettingsInput) => {
    setActiveModel(settings.model);
    setActiveProvider(settings.provider);
    setActiveThinking(settings.thinking);
    setActiveSmallModelMode(settings.smallModelMode);
    setActiveSystemInstruction(settings.systemInstruction);
    setActiveNotation(settings.notation);
    setActiveEnabledTools(settings.enabledTools);
    setActiveMaxToolSteps(settings.maxToolSteps);
  }, []);

  const restoreSettings = useCallback(
    (lockedSettings?: ConversationLockedSettings) => {
      setActiveModel(lockedSettings?.model ?? null);
      setActiveProvider(lockedSettings?.provider ?? null);
      setActiveThinking(lockedSettings?.thinking ?? null);
      setActiveSmallModelMode(lockedSettings?.smallModelMode ?? null);
      setActiveSystemInstruction(lockedSettings?.systemInstruction ?? null);
      setActiveNotation(lockedSettings?.notation ?? null);
      setActiveEnabledTools(lockedSettings?.enabledTools ?? null);
      // Nothing to restore — it locks when this conversation's client is built.
      setActiveMaxToolSteps(null);
    },
    [],
  );

  const clearSettings = useCallback(() => {
    setActiveModel(null);
    setActiveProvider(null);
    setActiveThinking(null);
    setActiveSmallModelMode(null);
    setActiveSystemInstruction(null);
    setActiveNotation(null);
    setActiveEnabledTools(null);
    setActiveMaxToolSteps(null);
  }, []);

  return {
    activeModel,
    activeProvider,
    activeThinking,
    activeSmallModelMode,
    activeSystemInstruction,
    activeNotation,
    activeEnabledTools,
    activeMaxToolSteps,
    lockSettings,
    restoreSettings,
    clearSettings,
  };
}
