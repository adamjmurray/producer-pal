// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { presetMatchesFields } from "#webui/hooks/settings/presets/preset-storage";
import { usePresets } from "#webui/hooks/settings/presets/use-presets";
import {
  type ChatPreset,
  type PresetFields,
  type UseSettingsReturn,
} from "#webui/types/settings";
import {
  PresetCreateForm,
  PresetDescriptionField,
  PresetPickerRow,
  SubagentDefaultRow,
} from "./helpers/preset-controls-parts";

interface PresetControlsProps {
  settings: UseSettingsReturn;
}

/**
 * Preset picker + Save-as/Update/Delete controls, the description editor, and
 * the "Default subagent" selector, shown on the dedicated Presets tab. Selecting
 * a preset loads its full bundle — provider/model/thinking + small-model mode +
 * toolset + notation — into the live editable settings buffer
 * (settings.applyPreset); the fields are captured from that same buffer, so each
 * one is edited by its own existing control (notation by the Notation dropdown
 * on the Tools tab) rather than duplicated here. The user then Saves through the
 * normal footer flow. The Default subagent selector
 * (SubagentDefaultRow) reuses this live preset list to pick which preset spawned
 * subagents run under. Presets never capture the API key (that stays in the
 * per-provider store).
 * @param {PresetControlsProps} props - Component props
 * @param {UseSettingsReturn} props.settings - The live settings buffer + actions
 * @returns {JSX.Element} The preset controls
 */
export function PresetControls({ settings }: PresetControlsProps) {
  const { presets, saveError, createPreset, updatePreset, deletePreset } =
    usePresets();
  const [selectedId, setSelectedId] = useState<string>("");
  const [naming, setNaming] = useState<boolean>(false);
  const [draftName, setDraftName] = useState<string>("");
  const [draftDescription, setDraftDescription] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fields: PresetFields = {
    provider: settings.provider,
    model: settings.model,
    thinking: settings.thinking,
    smallModelMode: settings.smallModelMode,
    enabledTools: settings.enabledTools,
    notation: settings.notation,
  };
  const selected = presets.find((p) => p.id === selectedId) ?? null;
  const fieldsModified =
    selected != null && !presetMatchesFields(selected, fields);
  const descriptionModified =
    selected != null && editDescription.trim() !== (selected.description ?? "");

  const handleSelect = (id: string): void => {
    setSelectedId(id);
    setError(null);
    const preset = presets.find((p) => p.id === id);

    if (preset) settings.applyPreset(preset);
    setEditDescription(preset?.description ?? "");
  };

  const confirmCreate = (): void => {
    const result = createPreset(draftName, fields, draftDescription);

    if (!result.ok) {
      setError(result.error);

      return;
    }

    setSelectedId(result.preset.id);
    setEditDescription(result.preset.description ?? "");
    setNaming(false);
    setDraftName("");
    setDraftDescription("");
    setError(null);
  };

  const cancelNaming = (): void => {
    setNaming(false);
    setDraftName("");
    setDraftDescription("");
    setError(null);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm mb-1" htmlFor="preset-select">
        Preset
      </label>
      <PresetPickerRow
        presets={presets}
        selectedId={selectedId}
        selected={selected}
        naming={naming}
        onSelect={handleSelect}
        onStartNaming={() => {
          setNaming(true);
          setDraftName("");
          setDraftDescription("");
          setError(null);
        }}
        onUpdate={() =>
          selected && updatePreset(selected.id, fields, editDescription)
        }
        onDelete={() => {
          if (selected) deletePreset(selected.id);
          setSelectedId("");
          setEditDescription("");
        }}
      />

      {selected && (fieldsModified || descriptionModified) && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Unsaved edits — “Update” overwrites “{selected.name}”, or “Save as…”
          keeps a new one.
        </p>
      )}

      {naming && (
        <PresetCreateForm
          draftName={draftName}
          draftDescription={draftDescription}
          onNameChange={setDraftName}
          onDescriptionChange={setDraftDescription}
          onConfirm={confirmCreate}
          onCancel={cancelNaming}
        />
      )}

      {selected && !naming && (
        <PresetDescriptionField
          value={editDescription}
          onChange={setEditDescription}
        />
      )}

      {/* One paragraph for both channels: `error` is this form's own rejection
          (blank/duplicate name), `saveError` is a storage write that failed —
          including from Update/Delete, which have no result to return. A failed
          create sets both to the same message, so `??` shows it once. */}
      {(error ?? saveError) != null && (
        <p
          className="text-xs text-red-600 dark:text-red-400"
          data-testid="preset-error"
        >
          {error ?? saveError}
        </p>
      )}

      <SubagentDefaultRow
        presets={presets}
        value={settings.defaultSubagentPresetId}
        onChange={settings.setDefaultSubagentPresetId}
        missingKeyIds={presetsMissingApiKey(settings, presets)}
      />
    </div>
  );
}

/**
 * Preset ids whose provider has no usable API key, so the Default-subagent
 * picker can flag them (such a preset builds a worker that fails at request time
 * — after burning a spawn against the cap).
 *
 * Reads the DECRYPTED, buffer-live key via getProviderConnection — the exact
 * value the worker will send (use-chat-mode-state's resolveConnection wraps the
 * same call). Deliberately NOT checkHasApiKey, which reads the raw stored
 * envelope: that both misses a just-typed unsaved key AND falsely reports a key
 * for an orphaned/undecryptable envelope (the IndexedDB crypto key was reset
 * while the localStorage envelope persisted) — the very case a warning should
 * catch. See the same reasoning on `hasApiKey` in use-settings.
 *
 * Empty until settingsLoaded, since every provider's key is blank until the
 * post-mount decrypt lands (else it would flash "no key" on all of them).
 * lmstudio / ollama need no key, so they're never flagged.
 * @param settings - The live settings buffer
 * @param presets - The preset list
 * @returns The set of preset ids missing a usable provider key
 */
function presetsMissingApiKey(
  settings: UseSettingsReturn,
  presets: ChatPreset[],
): Set<string> {
  if (!settings.settingsLoaded) return new Set();

  return new Set(
    presets
      .filter((p) => {
        if (p.provider === "lmstudio" || p.provider === "ollama") return false;

        return !settings.getProviderConnection(p.provider).apiKey;
      })
      .map((p) => p.id),
  );
}
