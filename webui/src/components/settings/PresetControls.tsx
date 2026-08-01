// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { presetMatchesFields } from "#webui/hooks/settings/presets/preset-storage";
import { usePresetDraft } from "#webui/hooks/settings/presets/use-preset-draft";
import { usePresets } from "#webui/hooks/settings/presets/use-presets";
import {
  type ChatPreset,
  type PresetFields,
  type UseSettingsReturn,
} from "#webui/types/settings";
import {
  PresetCreateForm,
  PresetDescriptionField,
  PresetNotices,
  PresetPickerRow,
  SubagentPresetRow,
} from "./helpers/preset-controls-parts";

interface PresetControlsProps {
  settings: UseSettingsReturn;
  /** Reports whether the "New preset" form is open, so the modal can block both
   * Save and the backdrop/Esc dismiss — neither creates the preset nor keeps
   * the draft, they just close the dialog on top of it. */
  onDraftOpenChange?: (open: boolean) => void;
}

/**
 * Preset picker + Save-as/Update/Delete controls, the description editor, and
 * the "Subagent preset" selector, shown on the dedicated Presets tab. Selecting
 * a preset loads its full bundle — provider/model/thinking + small-model mode +
 * toolset + notation — into the live editable settings buffer
 * (settings.applyPreset); the fields are captured from that same buffer, so each
 * one is edited by its own existing control (notation by the Notation dropdown
 * on the Tools tab) rather than duplicated here. The user then Saves through the
 * normal footer flow. The Subagent preset selector
 * (SubagentPresetRow) reuses this live preset list to pick which preset spawned
 * subagents run under. Presets never capture the API key (that stays in the
 * per-provider store).
 *
 * Note the split persistence: every button here writes to localStorage on
 * click, while the surrounding settings stay buffered until the footer Save.
 * The tab says so out loud, because nothing else on screen shows it.
 * @param {PresetControlsProps} props - Component props
 * @param {UseSettingsReturn} props.settings - The live settings buffer + actions
 * @param {Function} props.onDraftOpenChange - Reports the create form's state
 * @returns {JSX.Element} The preset controls
 */
export function PresetControls({
  settings,
  onDraftOpenChange,
}: PresetControlsProps) {
  const {
    presets,
    saveError,
    createPreset,
    updatePreset,
    updatePresetDescription,
    deletePreset,
  } = usePresets();
  const draft = usePresetDraft(onDraftOpenChange);
  const [selectedId, setSelectedId] = useState<string>("");
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

  const handleSelect = (id: string): void => {
    setSelectedId(id);
    setError(null);
    const preset = presets.find((p) => p.id === id);

    if (preset) settings.applyPreset(preset);
    setEditDescription(preset?.description ?? "");
  };

  const confirmCreate = (): void => {
    const result = createPreset(draft.name, fields, draft.description);

    if (!result.ok) {
      setError(result.error);

      return;
    }

    setSelectedId(result.preset.id);
    setEditDescription(result.preset.description ?? "");
    draft.close();
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
        naming={draft.open}
        onSelect={handleSelect}
        onStartNaming={() => {
          draft.start();
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

      {/* One error slot for both channels: `error` is this form's own rejection
          (blank/duplicate name), `saveError` is a storage write that failed —
          including from Update/Delete, which have no result to return. A failed
          create sets both to the same message, so `??` shows it once. */}
      <PresetNotices
        driftedFrom={fieldsModified ? selected.name : null}
        error={error ?? saveError}
      />

      {draft.open && (
        <PresetCreateForm
          draftName={draft.name}
          draftDescription={draft.description}
          onNameChange={draft.setName}
          onDescriptionChange={draft.setDescription}
          onConfirm={confirmCreate}
          onCancel={() => {
            draft.close();
            setError(null);
          }}
        />
      )}

      {selected && !draft.open && (
        // Persists on every keystroke, not on blur or Update: Esc closes this
        // dialog straight from the focused field, and a blur that never fires
        // loses the edit. The local copy stays untrimmed so typing a trailing
        // space isn't yanked back out from under the cursor.
        <PresetDescriptionField
          value={editDescription}
          onChange={(value) => {
            setEditDescription(value);
            updatePresetDescription(selected.id, value);
          }}
        />
      )}

      <SubagentPresetRow
        presets={presets}
        value={settings.subagentPresetId}
        onChange={settings.setSubagentPresetId}
        missingKeyIds={presetsMissingApiKey(settings, presets)}
      />
    </div>
  );
}

/**
 * Preset ids whose provider has no usable API key, so the Subagent-preset
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
