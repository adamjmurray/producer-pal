// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { CharTokenCount } from "#webui/components/context/collection/CharTokenCount";
import {
  EditorFooter,
  Field,
  INPUT_CLASS,
  NameField,
} from "#webui/components/context/collection/collection-editor-parts";
import {
  type CustomSkillView,
  type UseCustomSkillsCollectionReturn,
} from "#webui/hooks/context/use-custom-skills-collection";

interface CustomSkillEditorProps {
  /** The collection hook (per-entry save/delete lives here). */
  collection: UseCustomSkillsCollectionReturn;
  /** The skill being edited, or null when creating a new one. */
  entry: CustomSkillView | null;
  /** Called after a successful save with the stored skill's slug. */
  onSaved: (name: string) => void;
  /** Called after a successful delete. */
  onDeleted: () => void;
}

/**
 * Right-pane form for one custom skill: name (editable only when creating — the
 * slug is the stable handle), a one-line description hook, an enabled toggle, and
 * the instruction body the assistant loads on demand. Keyed by the selected
 * entry in the parent so the draft re-seeds on selection change.
 * @param props - Editor props
 * @returns Editor element
 */
export function CustomSkillEditor(
  props: CustomSkillEditorProps,
): preact.JSX.Element {
  const { collection, entry, onSaved, onDeleted } = props;
  const isNew = entry == null;
  const [name, setName] = useState(entry?.name ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [enabled, setEnabled] = useState(entry?.enabled ?? true);
  const [body, setBody] = useState(entry?.body ?? "");

  const targetName = isNew ? name : entry.name;
  const canSave =
    targetName.trim().length > 0 &&
    body.trim().length > 0 &&
    collection.saveStatus !== "saving";

  const handleSave = async (): Promise<void> => {
    const saved = await collection.saveEntry(
      targetName,
      { description, content: body, enabled },
      isNew,
    );

    if (saved) onSaved(saved.name);
  };

  const handleDelete = async (): Promise<void> => {
    if (isNew) return;
    if (
      !window.confirm(
        `Delete custom skill "${entry.name}"? This cannot be undone.`,
      )
    )
      return;

    if (await collection.deleteEntry(entry.name)) onDeleted();
  };

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1 overflow-y-auto p-4">
      <NameField
        isNew={isNew}
        name={name}
        displayName={entry?.name}
        placeholder="jazz-voicings"
        onChange={setName}
      />
      <Field
        label="Description"
        hint="One-line “load me when…” hook shown in the index."
      >
        <input
          type="text"
          value={description}
          onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
          className={INPUT_CLASS}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled((e.target as HTMLInputElement).checked)}
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
        />
        Enabled
        <span className="font-normal text-xs text-zinc-400 dark:text-zinc-500">
          Only enabled skills are offered to the assistant.
        </span>
      </label>
      <Field label="Instructions">
        <textarea
          value={body}
          onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
          rows={12}
          className={`${INPUT_CLASS} resize-none font-mono leading-relaxed`}
        />
        <div className="mt-1 flex justify-end">
          <CharTokenCount chars={body.length} />
        </div>
      </Field>
      <EditorFooter
        saveStatus={collection.saveStatus}
        saveError={collection.saveError}
        isNew={isNew}
        canSave={canSave}
        createLabel="Create skill"
        onSave={() => void handleSave()}
        onDelete={() => void handleDelete()}
      />
    </div>
  );
}
