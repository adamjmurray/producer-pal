// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";
import { type UseSettingsReturn } from "#webui/types/settings";

export interface AppearanceSettings {
  theme: string;
  showTimestamps: boolean;
  showHelpLinks: boolean;
  showTokenUsage: boolean;
}

/**
 * Build a serializable snapshot string from settings and appearance values.
 * liveApiEnabled, notation, and subagentPresetId are intentionally omitted —
 * they can change out from under the modal (device Setup pane, focus refetch,
 * deleting the preset the subagent points at), so comparing against a snapshot
 * taken at open time gives false positives. The first two track user intent
 * with dirty flags; subagentPresetId is compared against its saved value.
 * @param {UseSettingsReturn} s - Settings hook return value
 * @param {AppearanceSettings} a - Appearance settings
 * @returns {string} JSON snapshot for comparison
 */
function serialize(s: UseSettingsReturn, a: AppearanceSettings): string {
  return JSON.stringify({
    provider: s.provider,
    apiKey: s.apiKey,
    baseUrl: s.baseUrl,
    model: s.model,
    thinking: s.thinking,
    enabledTools: s.enabledTools,
    smallModelMode: s.smallModelMode,
    maxToolSteps: s.maxToolSteps,
    realtimeVoice: s.realtimeVoice,
    voiceSpeed: s.voiceSpeed,
    voiceVolume: s.voiceVolume,
    voiceLanguage: s.voiceLanguage,
    turnDetection: s.turnDetection,
    ...a,
  });
}

/**
 * Hook that detects unsaved changes in settings by comparing current values
 * against a snapshot captured when the settings modal opens.
 * @param {UseSettingsReturn} settings - Current settings from useSettings hook
 * @param {AppearanceSettings} appearance - Current appearance settings
 * @param {boolean} settingsOpen - Whether the settings modal is open
 * @returns {boolean} True if any settings have changed since the modal opened
 */
export function useHasUnsavedChanges(
  settings: UseSettingsReturn,
  appearance: AppearanceSettings,
  settingsOpen: boolean,
): boolean {
  const [snapshot, setSnapshot] = useState("");

  // Capture a baseline the first render the modal is open, then clear it on
  // close so the next open recaptures. Keying off "snapshot is empty" (rather
  // than a closed→open transition) also covers the modal being open from the
  // very first render — first-run auto-open, or reloading with the settings
  // modal still open (persisted view state) — where there is no transition to
  // detect and edits would otherwise never register as unsaved.
  //
  // Gate the capture on settingsLoaded: the apiKey is decrypted asynchronously
  // after mount, so snapshotting before it lands (modal open from the first
  // render) would record the blank pre-decrypt key and then falsely flag
  // unsaved changes the moment the real key arrives. The effect re-runs when
  // settingsLoaded flips true and captures the loaded values.
  useEffect(() => {
    if (settingsOpen && snapshot === "" && settings.settingsLoaded) {
      setSnapshot(serialize(settings, appearance));
    } else if (!settingsOpen && snapshot !== "") {
      setSnapshot("");
    }
  }, [settingsOpen, settings, appearance, snapshot]);

  if (!settingsOpen || snapshot === "") return false;

  return (
    serialize(settings, appearance) !== snapshot ||
    subagentPresetChanged(settings) ||
    settings.liveApiEnabledDirty ||
    settings.notationDirty
  );
}

/**
 * Whether the buffered Subagent preset differs from the saved one.
 *
 * Compared against the saved value rather than the open-time snapshot because
 * deleting the preset the Subagent preset points at clears the buffer AND saves
 * on the spot (forgetDeletedPreset in useSettings). A snapshot still naming the
 * deleted preset reads that already-saved change as an unsaved edit the user
 * never made, and the modal then refuses to close.
 * @param {UseSettingsReturn} s - Settings hook return value
 * @returns {boolean} True if the buffered id differs from the saved one
 */
function subagentPresetChanged(s: UseSettingsReturn): boolean {
  return s.subagentPresetId !== s.savedSubagentPresetId;
}
