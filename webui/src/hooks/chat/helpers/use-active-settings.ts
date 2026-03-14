// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "preact/hooks";
import { type ConversationLockedSettings } from "#webui/hooks/chat/use-chat-types";
import { type Provider } from "#webui/types/settings";

/** State for the "locked" settings of the current conversation */
export interface ActiveSettings {
  activeModel: string | null;
  activeProvider: Provider | null;
  activeThinking: string | null;
  activeTemperature: number | null;
  activeShowThoughts: boolean | null;
  activeSmallModelMode: boolean | null;
}

interface ActiveSettingsActions {
  /** Lock settings when a new conversation starts */
  lockSettings: (
    model: string,
    provider: Provider,
    thinking: string,
    temperature: number,
    showThoughts: boolean | null,
    smallModelMode: boolean,
  ) => void;
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
  const [activeTemperature, setActiveTemperature] = useState<number | null>(
    null,
  );
  const [activeShowThoughts, setActiveShowThoughts] = useState<boolean | null>(
    null,
  );
  const [activeSmallModelMode, setActiveSmallModelMode] = useState<
    boolean | null
  >(null);

  const lockSettings = useCallback(
    (
      model: string,
      provider: Provider,
      thinking: string,
      temperature: number,
      showThoughts: boolean | null,
      smallModelMode: boolean,
    ) => {
      setActiveModel(model);
      setActiveProvider(provider);
      setActiveThinking(thinking);
      setActiveTemperature(temperature);
      setActiveShowThoughts(showThoughts);
      setActiveSmallModelMode(smallModelMode);
    },
    [],
  );

  const restoreSettings = useCallback(
    (lockedSettings?: ConversationLockedSettings) => {
      setActiveModel(lockedSettings?.model ?? null);
      setActiveProvider(lockedSettings?.provider ?? null);
      setActiveThinking(lockedSettings?.thinking ?? null);
      setActiveTemperature(lockedSettings?.temperature ?? null);
      setActiveShowThoughts(lockedSettings?.showThoughts ?? null);
      setActiveSmallModelMode(lockedSettings?.smallModelMode ?? null);
    },
    [],
  );

  const clearSettings = useCallback(() => {
    setActiveModel(null);
    setActiveProvider(null);
    setActiveThinking(null);
    setActiveTemperature(null);
    setActiveShowThoughts(null);
    setActiveSmallModelMode(null);
  }, []);

  return {
    activeModel,
    activeProvider,
    activeThinking,
    activeTemperature,
    activeShowThoughts,
    activeSmallModelMode,
    lockSettings,
    restoreSettings,
    clearSettings,
  };
}
