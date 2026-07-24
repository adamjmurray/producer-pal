// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { presetMatchesFields } from "#webui/hooks/settings/presets/preset-storage";
import { usePresets } from "#webui/hooks/settings/presets/use-presets";
import {
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
 * toolset — into the live editable settings buffer (settings.applyPreset); the
 * user then Saves through the normal footer flow. The Default subagent selector
 * (SubagentDefaultRow) reuses this live preset list to pick which preset spawned
 * subagents run under. Presets never capture the API key (that stays in the
 * per-provider store).
 * @param {PresetControlsProps} props - Component props
 * @param {UseSettingsReturn} props.settings - The live settings buffer + actions
 * @returns {JSX.Element} The preset controls
 */
export function PresetControls({ settings }: PresetControlsProps) {
  const { presets, createPreset, updatePreset, deletePreset } = usePresets();
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

      {error && (
        <p
          className="text-xs text-red-600 dark:text-red-400"
          data-testid="preset-error"
        >
          {error}
        </p>
      )}

      <SubagentDefaultRow
        presets={presets}
        value={settings.defaultSubagentPresetId}
        onChange={settings.setDefaultSubagentPresetId}
      />
    </div>
  );
}
