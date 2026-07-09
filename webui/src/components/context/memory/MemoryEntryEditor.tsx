// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import {
  BodyField,
  DescriptionField,
  EditorFooter,
  Field,
  INPUT_CLASS,
  NameField,
} from "#webui/components/context/collection/collection-editor-parts";
import { useCollectionEntryAutosave } from "#webui/hooks/context/use-doc-collection";
import {
  type MemoryEntryView,
  type UseMemoryCollectionReturn,
} from "#webui/hooks/context/use-memory-collection";
import { MEMORY_TYPE_META, MEMORY_TYPE_ORDER } from "./memory-types";

interface MemoryEntryEditorProps {
  /** The collection hook (per-entry save/delete lives here). */
  collection: UseMemoryCollectionReturn;
  /** The entry being edited, or null when creating a new one. */
  entry: MemoryEntryView | null;
  /** Called after a successful save with the stored entry's slug. */
  onSaved: (name: string) => void;
  /** Called after a successful delete. */
  onDeleted: () => void;
}

/**
 * Right-pane form for one memory: name (editable only when creating — the slug
 * is the stable handle), type, one-line description, and a markdown body. Keyed
 * by the selected entry in the parent so the local draft re-seeds on selection
 * change. Autosaves so a draft is never lost on close/switch: idle-debounced for
 * an existing entry and flushed on unmount; a new entry persists on close (its
 * explicit Create button forks it into an existing entry). The list still polls
 * for the assistant's own writes.
 * @param props - Editor props
 * @returns Editor element
 */
export function MemoryEntryEditor(
  props: MemoryEntryEditorProps,
): preact.JSX.Element {
  const { collection, entry, onSaved, onDeleted } = props;
  const isNew = entry == null;
  const [name, setName] = useState(entry?.name ?? "");
  const [type, setType] = useState<string>(entry?.type ?? "user");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [body, setBody] = useState(entry?.body ?? "");

  const targetName = isNew ? name : entry.name;
  const canSave =
    targetName.trim().length > 0 &&
    body.trim().length > 0 &&
    collection.saveStatus !== "saving";

  // Creating (or re-creating a memory deleted out from under us) is create-only
  // so it can't silently overwrite an existing entry the name collides with.
  const doSave = (): Promise<MemoryEntryView | null> =>
    collection.saveEntry(
      targetName,
      { type, description, content: body },
      isNew,
    );

  const { noteSaved } = useCollectionEntryAutosave({
    canSave,
    draftKey: JSON.stringify([targetName, type, description, body]),
    autosaveOnIdle: !isNew,
    persist: async () => (await doSave()) != null,
  });

  const handleSave = async (): Promise<void> => {
    const saved = await doSave();

    if (saved) {
      noteSaved();
      onSaved(saved.name);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (isNew) return;
    if (
      !window.confirm(`Delete memory "${entry.name}"? This cannot be undone.`)
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
        placeholder="prefers-c-minor"
        onChange={setName}
      />
      <Field label="Type">
        <select
          value={type}
          onChange={(e) => setType((e.target as HTMLSelectElement).value)}
          className={INPUT_CLASS}
        >
          {MEMORY_TYPE_ORDER.map((value) => (
            <option key={value} value={value}>
              {MEMORY_TYPE_META[value].label} — {MEMORY_TYPE_META[value].hint}
            </option>
          ))}
        </select>
      </Field>
      <DescriptionField
        hint="One-line recall hook shown in the index."
        value={description}
        onChange={setDescription}
      />
      <BodyField label="Memory" value={body} onChange={setBody} rows={10} />
      <EditorFooter
        saveStatus={collection.saveStatus}
        saveError={collection.saveError}
        isNew={isNew}
        canSave={canSave}
        createLabel="Create memory"
        onSave={() => void handleSave()}
        onDelete={() => void handleDelete()}
      />
    </div>
  );
}
