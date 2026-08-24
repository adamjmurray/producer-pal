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
 * The preset dropdown plus the New / Update / Delete action buttons.
 * Update/Delete appear only when a preset is selected.
 *
 * None of these say "Save": all three write to storage on click, unlike the
 * modal's footer Save, and identical labels a few hundred pixels apart had
 * users clicking the footer expecting their preset to be created.
 *
 * The dropdown is disabled while the New-preset form is open. Selecting one
 * loads its whole bundle into the same settings buffer the form is about to
 * capture, so a stray pick mid-naming would silently save a copy of the picked
 * preset under the new name.
 * @param {PresetPickerRowProps} props - Picker row props
 * @returns {JSX.Element} The picker + action row
 */
export function PresetPickerRow(props: PresetPickerRowProps) {
  const { presets, selectedId, selected, naming } = props;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        id="preset-select"
        value={selectedId}
        onChange={(e) => props.onSelect((e.target as HTMLSelectElement).value)}
        disabled={naming}
        className={`min-w-40 flex-1 ${INPUT_CLASS} disabled:opacity-50`}
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
          data-testid="preset-new"
        >
          New…
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

interface PresetNoticesProps {
  /** Name of the selected preset when the settings have drifted from it, else
   * null — the cue to offer Update vs New…. */
  driftedFrom: string | null;
  /** Rejected-input or failed-write message to show, or null. */
  error: string | null;
}

/**
 * The three lines under the preset picker: the always-on reminder that these
 * buttons write immediately, the drift warning, and any error.
 *
 * The reminder is permanent on purpose. Presets are the only controls in this
 * dialog that persist on click; everything else waits for the footer Save, and
 * nothing else on screen distinguishes them.
 * @param {PresetNoticesProps} props - Notice props
 * @returns {JSX.Element} The notice block
 */
export function PresetNotices({ driftedFrom, error }: PresetNoticesProps) {
  return (
    <>
      <p className="text-xs text-zinc-500 dark:text-zinc-300">
        Presets save as soon as you click — the Save button below doesn’t apply
        to them.
      </p>

      {driftedFrom != null && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          These settings no longer match “{driftedFrom}” — “Update” overwrites
          it, or “New…” keeps a separate preset.
        </p>
      )}

      {error != null && (
        <p
          className="text-xs text-red-600 dark:text-red-400"
          data-testid="preset-error"
        >
          {error}
        </p>
      )}
    </>
  );
}

interface SubagentPresetRowProps {
  presets: ChatPreset[];
  /** Saved subagent preset id, or null to inherit. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Preset ids whose provider has no usable API key, annotated in the options
   * (a worker on such a preset would fail at request time). */
  missingKeyIds: Set<string>;
}

/**
 * The "Subagent preset" selector: which preset a spawned subagent runs under.
 * "Inherit current settings" (the empty value) clones the orchestrator's config;
 * a preset runs each worker on that preset's model/inference and toolset. Shown
 * below the preset controls on the Presets tab. Options whose provider has no
 * API key are annotated. Falls back to "Inherit" when the saved id no longer
 * matches a preset (deleted), matching the runtime's graceful inherit.
 * @param {SubagentPresetRowProps} props - Selector props
 * @returns {JSX.Element} The Subagent preset selector
 */
export function SubagentPresetRow(props: SubagentPresetRowProps) {
  const { presets, value, missingKeyIds } = props;
  const selectValue =
    value != null && presets.some((p) => p.id === value) ? value : "";

  return (
    <div className="border-t border-zinc-300 pt-3 dark:border-zinc-600">
      <label className="mb-1 block text-sm" htmlFor="subagent-preset-select">
        Subagent preset
      </label>
      <select
        id="subagent-preset-select"
        value={selectValue}
        onChange={(e) =>
          props.onChange((e.target as HTMLSelectElement).value || null)
        }
        className={`w-full ${INPUT_CLASS}`}
        data-testid="subagent-preset-select"
      >
        <option value="">Inherit current settings</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {missingKeyIds.has(p.id) ? " (no API key)" : ""}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-300">
        What spawned subagents run as when the Subagent tool is enabled. A
        preset runs each subagent on its own model, thinking, small-model mode,
        toolset, and notation (a preset saved without a toolset or notation
        keeps this conversation's). Subagents can never spawn their own
        subagents.
      </p>
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
 * The "name this preset" form shown after New…: a name field, an optional
 * description, and Create/Cancel. Enter in the name field confirms, Escape
 * cancels; the description is a textarea so Enter inserts a newline.
 *
 * Rendered as an inset card so it reads as its own sub-form — otherwise its
 * fields blend into the tab and its Description looks like the selected
 * preset's Description, which sits in the same spot.
 * @param {PresetCreateFormProps} props - Create form props
 * @returns {JSX.Element} The create-preset form
 */
export function PresetCreateForm(props: PresetCreateFormProps) {
  return (
    <div
      className="space-y-2 rounded border border-zinc-300 bg-zinc-200/50 p-3 dark:border-zinc-600 dark:bg-zinc-700/40"
      data-testid="preset-create-form"
    >
      <p className="text-sm font-medium">New preset</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-300">
        Captures the settings currently in this dialog.
      </p>
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
          data-testid="preset-create-confirm"
        >
          Create preset
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
        className="mb-1 block text-xs text-zinc-500 dark:text-zinc-300"
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
