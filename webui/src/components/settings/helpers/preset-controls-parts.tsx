// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ChatPreset } from "#webui/types/settings";

export const BUTTON_CLASS =
  "px-3 py-2 text-sm rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 whitespace-nowrap";
export const INPUT_CLASS =
  "px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded";

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
export function PresetPickerRow(props: PresetPickerRowProps) {
  const { presets, selectedId, selected, naming } = props;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        id="preset-select"
        value={selectedId}
        onChange={(e) => props.onSelect((e.target as HTMLSelectElement).value)}
        className={`flex-1 min-w-40 ${INPUT_CLASS}`}
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
          className={BUTTON_CLASS}
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
            className={BUTTON_CLASS}
            data-testid="preset-update"
          >
            Update
          </button>
          <button
            type="button"
            onClick={props.onDelete}
            className={`${BUTTON_CLASS} text-red-600 dark:text-red-400`}
            data-testid="preset-delete"
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}

interface PresetCreateFormProps {
  draftName: string;
  draftDescription: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The inline "name this preset" form shown after Save-as: a name field, an
 * optional description, and Save/Cancel. Enter in the name field confirms,
 * Escape cancels; the description is a textarea so Enter inserts a newline.
 * @param {PresetCreateFormProps} props - Create form props
 * @returns {JSX.Element} The create-preset form
 */
export function PresetCreateForm(props: PresetCreateFormProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={props.draftName}
          onInput={(e) =>
            props.onNameChange((e.target as HTMLInputElement).value)
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") props.onConfirm();
            if (e.key === "Escape") props.onCancel();
          }}
          placeholder="Preset name"
          className={`flex-1 ${INPUT_CLASS}`}
          data-testid="preset-name-input"
        />
        <button
          type="button"
          onClick={props.onConfirm}
          className={BUTTON_CLASS}
          data-testid="preset-name-save"
        >
          Save
        </button>
        <button type="button" onClick={props.onCancel} className={BUTTON_CLASS}>
          Cancel
        </button>
      </div>
      <PresetDescriptionField
        value={props.draftDescription}
        onChange={props.onDescriptionChange}
      />
    </div>
  );
}

interface PresetDescriptionFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Optional freeform description for a preset. Currently informational only —
 * reserved for the future "orchestrator picks a preset" feature. Shared by the
 * create form and the selected-preset editor.
 * @param {PresetDescriptionFieldProps} props - Description field props
 * @returns {JSX.Element} A labeled description textarea
 */
export function PresetDescriptionField(props: PresetDescriptionFieldProps) {
  return (
    <div>
      <label
        className="block text-xs text-zinc-500 mb-1"
        htmlFor="preset-description"
      >
        Description (optional)
      </label>
      <textarea
        id="preset-description"
        value={props.value}
        onInput={(e) => props.onChange((e.target as HTMLTextAreaElement).value)}
        rows={2}
        placeholder="What this preset is for (e.g. cheap bulk-edit worker)"
        className={`w-full resize-y ${INPUT_CLASS}`}
        data-testid="preset-description-input"
      />
    </div>
  );
}
