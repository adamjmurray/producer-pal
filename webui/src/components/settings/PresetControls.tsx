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

interface PresetControlsProps {
  settings: UseSettingsReturn;
}

const buttonClass =
  "px-3 py-2 text-sm rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 whitespace-nowrap";
const inputClass =
  "px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded";

/**
 * Preset picker + Save-as/Update/Delete controls at the top of the Connection
 * tab. Selecting a preset loads it into the live editable settings buffer
 * (settings.applyPreset); the user then Saves through the normal footer flow.
 * Presets capture provider/model/thinking + small-model mode — never the API
 * key (that stays in the per-provider store).
 * @param {PresetControlsProps} props - Component props
 * @param {UseSettingsReturn} props.settings - The live settings buffer + actions
 * @returns {JSX.Element} The preset controls
 */
export function PresetControls({ settings }: PresetControlsProps) {
  const { presets, createPreset, updatePreset, deletePreset } = usePresets();
  const [selectedId, setSelectedId] = useState<string>("");
  const [naming, setNaming] = useState<boolean>(false);
  const [draftName, setDraftName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fields: PresetFields = {
    provider: settings.provider,
    model: settings.model,
    thinking: settings.thinking,
    smallModelMode: settings.smallModelMode,
  };
  const selected = presets.find((p) => p.id === selectedId) ?? null;
  const isModified = selected != null && !presetMatchesFields(selected, fields);

  const handleSelect = (id: string): void => {
    setSelectedId(id);
    setError(null);
    const preset = presets.find((p) => p.id === id);

    if (preset) settings.applyPreset(preset);
  };

  const confirmCreate = (): void => {
    const result = createPreset(draftName, fields);

    if (!result.ok) {
      setError(result.error);

      return;
    }

    setSelectedId(result.preset.id);
    setNaming(false);
    setDraftName("");
    setError(null);
  };

  const cancelNaming = (): void => {
    setNaming(false);
    setDraftName("");
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
          setError(null);
        }}
        onUpdate={() => selected && updatePreset(selected.id, fields)}
        onDelete={() => {
          if (selected) deletePreset(selected.id);
          setSelectedId("");
        }}
      />

      {selected && isModified && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Unsaved edits — “Update” overwrites “{selected.name}”, or “Save as…”
          keeps a new one.
        </p>
      )}

      {naming && (
        <PresetNameForm
          draftName={draftName}
          onDraftChange={setDraftName}
          onConfirm={confirmCreate}
          onCancel={cancelNaming}
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

      <div className="border-b border-zinc-300 dark:border-zinc-600" />
    </div>
  );
}

interface PresetPickerRowProps {
  presets: ChatPreset[];
  selectedId: string;
  selected: ChatPreset | null;
  naming: boolean;
  onSelect: (id: string) => void;
  onStartNaming: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

/**
 * The preset dropdown plus the Save-as / Update / Delete action buttons.
 * Update/Delete appear only when a preset is selected.
 * @param {PresetPickerRowProps} props - Picker row props
 * @returns {JSX.Element} The picker + action row
 */
function PresetPickerRow(props: PresetPickerRowProps) {
  const { presets, selectedId, selected, naming } = props;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        id="preset-select"
        value={selectedId}
        onChange={(e) => props.onSelect((e.target as HTMLSelectElement).value)}
        className={`flex-1 min-w-40 ${inputClass}`}
        data-testid="preset-select"
      >
        <option value="">— Select a preset —</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {!naming && (
        <button
          type="button"
          onClick={props.onStartNaming}
          className={buttonClass}
          data-testid="preset-save-as"
        >
          Save as…
        </button>
      )}
      {selected && (
        <>
          <button
            type="button"
            onClick={props.onUpdate}
            className={buttonClass}
            data-testid="preset-update"
          >
            Update
          </button>
          <button
            type="button"
            onClick={props.onDelete}
            className={`${buttonClass} text-red-600 dark:text-red-400`}
            data-testid="preset-delete"
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}

interface PresetNameFormProps {
  draftName: string;
  onDraftChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The inline "name this preset" row shown after Save-as: a text field plus
 * Save/Cancel. Enter confirms, Escape cancels.
 * @param {PresetNameFormProps} props - Name form props
 * @returns {JSX.Element} The name-entry row
 */
function PresetNameForm(props: PresetNameFormProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={props.draftName}
        onInput={(e) =>
          props.onDraftChange((e.target as HTMLInputElement).value)
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") props.onConfirm();
          if (e.key === "Escape") props.onCancel();
        }}
        placeholder="Preset name"
        className={`flex-1 ${inputClass}`}
        data-testid="preset-name-input"
      />
      <button
        type="button"
        onClick={props.onConfirm}
        className={buttonClass}
        data-testid="preset-name-save"
      >
        Save
      </button>
      <button type="button" onClick={props.onCancel} className={buttonClass}>
        Cancel
      </button>
    </div>
  );
}
