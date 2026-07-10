// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import {
  BodyField,
  DescriptionField,
  EditorFooter,
  NameField,
} from "#webui/components/context/collection/collection-editor-parts";
import { ExternalUpdateBanner } from "#webui/components/context/ContextScreen";
import { useCollectionEntryAutosave } from "#webui/hooks/context/use-doc-collection";
import {
  type MemoryEntryView,
  type UseMemoryCollectionReturn,
} from "#webui/hooks/context/use-memory-collection";

interface MemoryEntryEditorProps {
  /** The collection hook (per-entry save/delete lives here). */
  collection: UseMemoryCollectionReturn;
  /** The entry being edited, or null when creating a new one. */
  entry: MemoryEntryView | null;
  /** Called after a successful save with the stored entry's slug. */
  onSaved: (name: string) => void;
}

/**
 * Right-pane form for one memory: name (editable only when creating — the slug
 * is the stable handle), one-line description, and a markdown body. Keyed
 * by the selected entry in the parent so the local draft re-seeds on selection
 * change. Autosaves so a draft is never lost on close/switch: idle-debounced for
 * an existing entry and flushed on unmount; a new entry persists on close (its
 * explicit Create button forks it into an existing entry). The list still polls
 * for the assistant's own writes, surfacing a Reload banner when this entry
 * changed elsewhere (the assistant's own context tool, another tab) while the
 * draft here is clean.
 * @param props - Editor props
 * @returns Editor element
 */
export function MemoryEntryEditor(
  props: MemoryEntryEditorProps,
): preact.JSX.Element {
  const { collection, entry, onSaved } = props;
  const isNew = entry == null;
  const [name, setName] = useState(entry?.name ?? "");
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
    collection.saveEntry(targetName, { description, content: body }, isNew);

  const { noteSaved, externalUpdate, adoptExternal } =
    useCollectionEntryAutosave({
      canSave,
      draftKey: memoryEntryKey({ name: targetName, description, body }),
      autosaveOnIdle: !isNew,
      persist: async () => {
        const saved = await doSave();

        return saved ? memoryEntryKey(saved) : null;
      },
      externalKey: entry != null ? memoryEntryKey(entry) : undefined,
    });

  const handleSave = async (): Promise<void> => {
    const saved = await doSave();

    if (saved) {
      noteSaved(memoryEntryKey(saved));
      onSaved(saved.name);
    }
  };

  // Commit a rename (blur / Enter on the name field). A no-op or empty change
  // just reverts the field. On success, mark the OLD-name draft as saved so the
  // unmount flush the navigation triggers can't re-create the old slug, then
  // navigate to the renamed entry. The current draft fields ride along, so a
  // dirty body isn't lost; a collision surfaces via saveError and reverts.
  const handleRename = (raw: string): void => {
    if (entry == null) return;
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed === entry.name) {
      setName(entry.name);

      return;
    }

    void collection
      .renameEntry(entry.name, trimmed, { description, content: body })
      .then((renamed) => {
        if (renamed == null) {
          setName(entry.name);

          return;
        }

        noteSaved(memoryEntryKey({ name: entry.name, description, body }));
        onSaved(renamed.name);
      });
  };

  // Adopt the server's current fields as the new draft AND advance the
  // autosave baseline. Order matters: adoptExternal reads externalKey off a
  // ref that isn't affected by these setState calls, so it's safe to call
  // after them (see the hook's adoptExternal doc for why the analogous
  // noteSaved-after-setState order would be unsafe).
  const handleReload = (): void => {
    if (entry == null) return;
    setName(entry.name);
    setDescription(entry.description);
    setBody(entry.body);
    adoptExternal();
  };

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1 overflow-y-auto p-4">
      {externalUpdate && (
        <ExternalUpdateBanner
          message="This memory was changed elsewhere (the assistant or another tab)."
          onReload={handleReload}
        />
      )}
      <NameField
        isNew={isNew}
        name={name}
        displayName={entry?.name}
        placeholder="prefers-c-minor"
        onChange={setName}
        onRename={handleRename}
      />
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
      />
    </div>
  );
}

// --- Helpers below main export ---

/**
 * Serialize a memory entry's persisted fields into one comparable key, used as
 * both the autosave `draftKey` (the local form fields) and `externalKey` (the
 * live `entry` prop) — the identical shape is what makes them comparable for
 * external-update detection.
 * @param fields - The entry's persisted fields
 * @param fields.name - The entry's slug
 * @param fields.description - The one-line recall hook
 * @param fields.body - The markdown body
 * @returns A stable, order-sensitive serialization of the three fields
 */
function memoryEntryKey(fields: {
  name: string;
  description: string;
  body: string;
}): string {
  return JSON.stringify([fields.name, fields.description, fields.body]);
}
