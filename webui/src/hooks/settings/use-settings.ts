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
import { errorMessage } from "#src/shared/error-utils";
import { DEFAULT_NOTATION, type Notation } from "#src/shared/notation";
import { type Provider, type UseSettingsReturn } from "#webui/types/settings";
import { useApplyPreset } from "./presets/preset-apply";
import {
  type AllProviderSettings,
  checkHasApiKey,
  DEFAULT_SETTINGS,
  loadAllProviderSettingsAsync,
  loadCurrentProvider,
  loadSubagentPresetId,
  loadEnabledTools,
  loadProviderSettings,
  loadSmallModelMode,
  type ProviderSettings,
  type ProviderSettingsApplier,
  type ProviderStateSetters,
  saveCurrentSettings,
  saveSubagentPresetId,
  saveSmallModelMode,
} from "./settings-helpers";
import { useProviderSlices } from "./use-provider-connections";
import { useVoiceModeSettings } from "./use-voice-mode-settings";

/**
 * Build the per-key setter bag (apiKey/model/baseUrl/...) that mutates the
 * currently selected provider's slice. Extracted so the main useSettings hook
 * stays under its function-length limit.
 *
 * @param {Provider} provider - Currently selected provider
 * @param {ProviderStateSetters} providerStateSetters - Map of provider state setters
 * @returns Setter bag for the active provider's fields
 */
function useProviderSetters(
  provider: Provider,
  providerStateSetters: ProviderStateSetters,
) {
  return useMemo(() => {
    const createSetter =
      <K extends keyof ProviderSettings>(key: K) =>
      (value: ProviderSettings[K]) => {
        providerStateSetters[provider]((prev) => ({ ...prev, [key]: value }));
      };

    const hasBaseUrl =
      provider === "custom" || provider === "lmstudio" || provider === "ollama";

    return {
      setApiKey: createSetter("apiKey"),
      setModel: createSetter("model"),
      setBaseUrl: hasBaseUrl ? createSetter("baseUrl") : undefined,
      setThinking: createSetter("thinking"),
    };
  }, [provider, providerStateSetters]);
}

// Hook manages state for 8 providers with individual setters and orchestration logic

/**
 * Hook for managing chat provider settings and tool enablement
 *
 * @returns {UseSettingsReturn} Settings state and management functions
 */
export function useSettings(): UseSettingsReturn {
  const [provider, setProviderState] = useState<Provider>(loadCurrentProvider);
  // `model` (returned below) is the in-modal value: changing it mid-edit
  // doesn't switch app modes. `savedModel` only updates on saveSettings and is
  // what App.tsx routes on — that way picking a realtime model in the provider
  // dropdown doesn't briefly mount VoiceApp behind the modal and trigger a
  // foreign-record bounce.
  const [savedModel, setSavedModel] = useState<string>(
    () => loadProviderSettings(loadCurrentProvider()).model,
  );
  // Save-buffered companion to `savedModel`. `provider` applies immediately, but
  // voice routing must pair the saved model with the saved provider, so this
  // lags `provider` until saveSettings (mirrors the savedModel rationale above).
  const [savedProvider, setSavedProvider] =
    useState<Provider>(loadCurrentProvider);
  // Save-buffered snapshot of `thinking` (per-provider, like `model`). The live
  // voice session reads this at connect time so an in-modal thinking edit
  // doesn't leak into the active RealtimeAgent's reasoning.effort — it applies
  // on the next Stop → Talk, matching the other saved* voice settings.
  const [savedThinking, setSavedThinking] = useState<string>(
    () => loadProviderSettings(loadCurrentProvider()).thinking,
  );
  const [settingsConfigured, setSettingsConfigured] = useState<boolean>(
    () => localStorage.getItem("producer_pal_settings_configured") === "true",
  );
  const [enabledTools, setEnabledToolsState] =
    useState<Record<string, boolean>>(loadEnabledTools);
  const [smallModelMode, setSmallModelModeState] =
    useState<boolean>(loadSmallModelMode);
  // Which preset a spawned subagent runs under (null = inherit the orchestrator
  // config). A modal-local buffer like smallModelMode: persisted on Save,
  // reverted on Cancel.
  const [subagentPresetId, setSubagentPresetId] = useState<string | null>(
    loadSubagentPresetId,
  );
  // False until the post-mount async decrypt has applied the real apiKeys.
  // saveSettings gates on this — saving the placeholder blanks would wipe
  // every stored encrypted key.
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);
  // Modal-local mirror of server config.liveApiEnabled. Synced from
  // useRemoteConfig in App.tsx; not persisted to localStorage because the
  // device Setup-tab toggle can change the value out from under us.
  // The dirty flag is set only by user-driven toggles (setLiveApiEnabled);
  // sync-from-server uses seedLiveApiEnabled and leaves it false.
  const [liveApiEnabled, setLiveApiEnabledState] = useState<boolean>(false);
  const [liveApiEnabledDirty, setLiveApiEnabledDirty] =
    useState<boolean>(false);
  // Modal-local mirror of server config.notation. Synced from useRemoteConfig
  // in App.tsx; not persisted to localStorage because the device Setup pane
  // can change it out from under us. Same dirty-flag convention as
  // liveApiEnabled: user edits use setNotation; sync-from-server uses
  // seedNotation and leaves dirty false.
  const [notation, setNotationState] = useState<Notation>(DEFAULT_NOTATION);
  const [notationDirty, setNotationDirty] = useState<boolean>(false);
  // Whether `notation` is a real answer (server-seeded or user-chosen) rather
  // than the provisional mount-time default. A new conversation locks the
  // notation at its first send, so the chat has to be able to tell the two
  // apart — DEFAULT_NOTATION is itself a valid choice, so the value can't say.
  // Set in the same update as the value so any render that sees this true also
  // sees the notation it refers to; a flag derived further upstream would lag a
  // render behind and defeat the point.
  const [notationKnown, setNotationKnown] = useState<boolean>(false);
  // Surfaced after a failed persist so the modal can stay open with a visible
  // error instead of closing with silent data loss (previously persistAllSettings
  // swallowed errors and the saved* snapshots were committed before the
  // encrypted write completed).
  const [saveError, setSaveError] = useState<string | null>(null);
  // In-modal voice settings vs. persisted/applied values. Same split as
  // `model`/`savedModel` — saveSettings/cancelSettings synchronize them, but
  // the live voice session reads the `saved*` snapshots so mid-edit changes
  // don't leak into the active RealtimeAgent.
  const voiceModeSettings = useVoiceModeSettings();

  const setLiveApiEnabled = useCallback((enabled: boolean) => {
    setLiveApiEnabledState(enabled);
    setLiveApiEnabledDirty(true);
  }, []);

  const seedLiveApiEnabled = useCallback((enabled: boolean) => {
    setLiveApiEnabledState(enabled);
    setLiveApiEnabledDirty(false);
  }, []);

  const setNotation = useCallback((value: Notation) => {
    setNotationState(value);
    setNotationDirty(true);
    setNotationKnown(true);
  }, []);

  const seedNotation = useCallback((value: Notation) => {
    setNotationState(value);
    setNotationDirty(false);
    setNotationKnown(true);
  }, []);
  const {
    providerSettings,
    getProviderConnection,
    providerStateSetters,
    openaiSettings,
    geminiSettings,
  } = useProviderSlices();

  const currentSettings = providerSettings[provider];

  const applyPreset = useApplyPreset(
    providerStateSetters,
    setProviderState,
    setSmallModelModeState,
    setEnabledToolsState,
    setNotation,
  );

  const applyLoadedSettings = useCallback(
    (allSettings: typeof DEFAULT_SETTINGS) => {
      for (const p of Object.keys(allSettings) as Provider[]) {
        providerStateSetters[p](() => allSettings[p]);
      }
    },
    [providerStateSetters],
  );

  // Cancels whichever decrypt-and-apply is still in flight. Every start replaces
  // it, so a second load (cancel, then cancel again) can't have the earlier one
  // apply on top of the later, and unmount can't apply into a dead component.
  const cancelPendingLoadRef = useRef<(() => void) | null>(null);

  // Post-mount: replace the synchronous placeholder settings (apiKey blanked)
  // with the real values, decrypting each provider's apiKey from its at-rest
  // envelope. Runs once; the synchronous useState initializers above already
  // populated everything except the (async-decrypted) apiKey.
  useEffect(() => {
    cancelPendingLoadRef.current = applyDecryptedSettings(
      applyLoadedSettings,
      () => setSettingsLoaded(true),
    );

    return () => cancelPendingLoadRef.current?.();
  }, [applyLoadedSettings]);

  const saveSettings = useCallback(async (): Promise<boolean> => {
    if (!warnIfNotLoaded(settingsLoaded)) return false;

    setSaveError(null);

    // Persist FIRST and only commit the in-memory saved* snapshots after the
    // encrypted write lands. The previous order (commit synchronously, then
    // await persist) treated the modal as closed and routed off the new saved*
    // values even when encryption/IndexedDB failed — the user saw silent data
    // loss only on the next reload. Now a failed persist returns false, the
    // modal stays open, and saveError surfaces it.
    try {
      await persistAllSettings(
        provider,
        enabledTools,
        providerSettings,
        smallModelMode,
        subagentPresetId,
      );
    } catch (err) {
      console.error("Failed to save provider settings", err);
      setSaveError(errorMessage(err));

      return false;
    }

    voiceModeSettings.commit();
    setSavedModel(providerSettings[provider].model);
    setSavedProvider(provider);
    setSavedThinking(providerSettings[provider].thinking);
    setSettingsConfigured(true);
    setLiveApiEnabledDirty(false);
    setNotationDirty(false);

    return true;
  }, [
    settingsLoaded,
    provider,
    enabledTools,
    smallModelMode,
    subagentPresetId,
    voiceModeSettings,
    providerSettings,
  ]);

  const cancelSettings = useCallback(() => {
    setProviderState(loadCurrentProvider());
    setEnabledToolsState(loadEnabledTools());
    setSmallModelModeState(loadSmallModelMode());
    setSubagentPresetId(loadSubagentPresetId());
    voiceModeSettings.revert();
    // Re-decrypt and restore saved provider settings (async; the apiKey lands a
    // tick later, mirroring the post-mount load). Pass the same onLoaded as the
    // post-mount effect so a cancel-during-initial-load (StrictMode remount,
    // fast cancel-then-reopen) still settles settingsLoaded → true — otherwise
    // the next Save would silently no-op via warnIfNotLoaded.
    cancelPendingLoadRef.current?.();
    cancelPendingLoadRef.current = applyDecryptedSettings(
      applyLoadedSettings,
      () => setSettingsLoaded(true),
    );
    // Clear dirty so the next sync from server re-seeds local state
    // (the user-toggle-then-cancel case otherwise leaves a stale value).
    setLiveApiEnabledDirty(false);
    setNotationDirty(false);
    setSaveError(null);
  }, [applyLoadedSettings, voiceModeSettings]);

  const { setApiKey, setModel, setBaseUrl, setThinking } = useProviderSetters(
    provider,
    providerStateSetters,
  );
  // Reconcile presence with the *decrypted* in-memory key. decryptApiKey fails
  // safe to "" for an orphaned/undecryptable envelope (e.g. the IndexedDB crypto
  // key was reset while the localStorage envelope persisted), so reading the raw
  // stored envelope would falsely report a usable key. currentSettings.apiKey is
  // the decrypted value (blank until the post-mount load lands), so it matches
  // what requests will actually send. lmstudio/ollama need no key — keep their
  // "configured at all" signal via checkHasApiKey.
  const hasApiKey =
    provider === "lmstudio" || provider === "ollama"
      ? checkHasApiKey(provider)
      : Boolean(currentSettings.apiKey);
  const resetBehaviorToDefaults = useCallback(() => {
    setThinking(DEFAULT_SETTINGS[provider].thinking);
  }, [provider, setThinking]);
  const hasBaseUrl = ["custom", "lmstudio", "ollama"].includes(provider);

  return {
    provider,
    // setProviderState (the useState setter) is already stable and accepts a
    // bare Provider, so it serves as setProvider directly — no wrapper needed.
    setProvider: setProviderState,
    apiKey: currentSettings.apiKey,
    setApiKey,
    // Voice routing needs both voice-provider keys regardless of which provider
    // is active in Settings, so it can resume a saved OpenAI record while
    // current settings are Gemini (and vice versa) instead of falsely showing
    // "key required". `currentSettings.apiKey` only reflects the active one.
    openaiApiKey: openaiSettings.apiKey,
    geminiApiKey: geminiSettings.apiKey,
    getProviderConnection,
    baseUrl: hasBaseUrl ? currentSettings.baseUrl : undefined,
    setBaseUrl: hasBaseUrl ? setBaseUrl : undefined,
    model: currentSettings.model,
    setModel,
    savedModel,
    savedProvider,
    thinking: currentSettings.thinking,
    setThinking,
    savedThinking,
    applyPreset,
    saveSettings,
    cancelSettings,
    hasApiKey,
    settingsConfigured,
    settingsLoaded,
    enabledTools,
    setEnabledTools: setEnabledToolsState,
    resetBehaviorToDefaults,
    smallModelMode,
    setSmallModelMode: setSmallModelModeState,
    subagentPresetId,
    setSubagentPresetId,
    saveError,
    liveApiEnabled,
    liveApiEnabledDirty,
    setLiveApiEnabled,
    seedLiveApiEnabled,
    notation,
    notationDirty,
    notationKnown,
    setNotation,
    seedNotation,
    realtimeVoice: voiceModeSettings.realtimeVoice,
    setRealtimeVoice: voiceModeSettings.setRealtimeVoice,
    savedRealtimeVoice: voiceModeSettings.savedRealtimeVoice,
    voiceSpeed: voiceModeSettings.voiceSpeed,
    setVoiceSpeed: voiceModeSettings.setVoiceSpeed,
    savedVoiceSpeed: voiceModeSettings.savedVoiceSpeed,
    voiceVolume: voiceModeSettings.voiceVolume,
    setVoiceVolume: voiceModeSettings.setVoiceVolume,
    turnDetection: voiceModeSettings.turnDetection,
    setTurnDetection: voiceModeSettings.setTurnDetection,
    savedTurnDetection: voiceModeSettings.savedTurnDetection,
    voiceLanguage: voiceModeSettings.voiceLanguage,
    setVoiceLanguage: voiceModeSettings.setVoiceLanguage,
    savedVoiceLanguage: voiceModeSettings.savedVoiceLanguage,
  };
}

/**
 * Gate save until the post-mount decrypt has applied real apiKeys. Returns
 * false (and logs) when still loading so the caller can bail before persisting
 * blank placeholders that would overwrite stored encrypted keys.
 * @param {boolean} settingsLoaded - True once decrypted settings have been applied
 * @returns {boolean} True when save may proceed
 */
function warnIfNotLoaded(settingsLoaded: boolean): boolean {
  if (settingsLoaded) return true;
  console.warn(
    "Settings not yet loaded; ignoring save to avoid wiping stored apiKeys",
  );

  return false;
}

/**
 * Persist encrypted provider settings and the small-model-mode flag. Rejects
 * when the encrypted write fails so saveSettings can keep the modal open and
 * surface the error instead of committing the in-memory saved* snapshots
 * against an empty at-rest envelope.
 *
 * The encrypted write goes first because it's the one that can fail. The two
 * localStorage flags after it are what cancelSettings reads back, so writing
 * them first would leave a failed Save already applied — and Cancel would then
 * restore the values the user was trying to abandon.
 * @param {Provider} provider - Currently selected provider
 * @param {Record<string, boolean>} enabledTools - Tool enabled states
 * @param {AllProviderSettings} allSettings - Settings for every provider
 * @param {boolean} smallModelMode - Small-model-mode flag
 * @param {string | null} subagentPresetId - Subagent preset id (null = inherit)
 */
async function persistAllSettings(
  provider: Provider,
  enabledTools: Record<string, boolean>,
  allSettings: AllProviderSettings,
  smallModelMode: boolean,
  subagentPresetId: string | null,
): Promise<void> {
  await saveCurrentSettings(provider, enabledTools, allSettings);
  saveSmallModelMode(smallModelMode);
  saveSubagentPresetId(subagentPresetId);
}

/**
 * Load and decrypt all provider settings, then apply them via the given setter.
 * Returns a cleanup callback (for useEffect) that ignores a late-arriving load
 * after unmount. Errors are logged, never thrown into render.
 * @param {ProviderSettingsApplier} apply - Setter that writes loaded settings to state
 * @param {() => void} onLoaded - Called after the load settles (success OR failure), skipped on unmount. Unlocks save even when decryption is broken (e.g., IndexedDB key reset) so the user can recover by typing fresh keys.
 * @returns {() => void} Cleanup that cancels a pending apply
 */
function applyDecryptedSettings(
  apply: ProviderSettingsApplier,
  onLoaded?: () => void,
): () => void {
  let cancelled = false;

  loadAllProviderSettingsAsync()
    .then((loaded) => {
      if (cancelled) return;
      apply(loaded);
      onLoaded?.();
    })
    .catch((err: unknown) => {
      console.error("Failed to load provider settings", err);
      if (!cancelled) onLoaded?.();
    });

  return () => {
    cancelled = true;
  };
}
