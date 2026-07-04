// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { CharTokenCount } from "#webui/components/context/CharTokenCount";
import {
  type MemoryEntryView,
  type UseMemoryCollectionReturn,
} from "#webui/hooks/context/use-memory-collection";
import { MEMORY_TYPE_META, MEMORY_TYPE_ORDER } from "./memory-types";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60";

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
 * change. Saves explicitly (memory records are structured, so autosave-on-idle
 * would be surprising); the list still polls for the assistant's own writes.
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

  const handleSave = async (): Promise<void> => {
    // Creating (or re-creating a memory deleted out from under us) is create-only
    // so it can't silently overwrite an existing entry the name collides with.
    const saved = await collection.saveEntry(
      targetName,
      { type, description, content: body },
      isNew,
    );

    if (saved) onSaved(saved.name);
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
      <NameField isNew={isNew} name={name} onChange={setName} entry={entry} />
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
      <Field
        label="Description"
        hint="One-line recall hook shown in the index."
      >
        <input
          type="text"
          value={description}
          onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="Memory">
        <textarea
          value={body}
          onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
          rows={10}
          className={`${INPUT_CLASS} resize-none font-mono leading-relaxed`}
        />
        <div className="mt-1 flex justify-end">
          <CharTokenCount chars={body.length} />
        </div>
      </Field>
      <EditorFooter
        collection={collection}
        isNew={isNew}
        canSave={canSave}
        onSave={() => void handleSave()}
        onDelete={() => void handleDelete()}
      />
    </div>
  );
}

// --- Helpers below main export ---

interface NameFieldProps {
  isNew: boolean;
  name: string;
  entry: MemoryEntryView | null;
  onChange: (name: string) => void;
}

/**
 * The name row: an editable slug input when creating, or the fixed slug (shown
 * read-only) when editing an existing entry.
 * @param props - Name field props
 * @returns Name field element
 */
function NameField(props: NameFieldProps): preact.JSX.Element {
  const { isNew, name, entry, onChange } = props;

  if (!isNew) {
    return (
      <Field label="Name">
        <div className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
          {entry?.name}
        </div>
      </Field>
    );
  }

  return (
    <Field label="Name" hint="Letters and digits; spaces become hyphens.">
      <input
        type="text"
        value={name}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        placeholder="prefers-c-minor"
        className={INPUT_CLASS}
      />
    </Field>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  children: preact.ComponentChildren;
}

/**
 * A labeled form row: a small heading (with optional hint) above its control.
 * @param props - Field props
 * @returns Field element
 */
function Field(props: FieldProps): preact.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
        {props.label}
        {props.hint != null && (
          <span className="ml-2 font-normal text-zinc-400 dark:text-zinc-500">
            {props.hint}
          </span>
        )}
      </span>
      {props.children}
    </label>
  );
}

interface EditorFooterProps {
  collection: UseMemoryCollectionReturn;
  isNew: boolean;
  canSave: boolean;
  onSave: () => void;
  onDelete: () => void;
}

/**
 * The action row: Save (primary), Delete (existing entries only), and the save
 * status / error text.
 * @param props - Footer props
 * @returns Footer element
 */
function EditorFooter(props: EditorFooterProps): preact.JSX.Element {
  const { collection, isNew, canSave, onSave, onDelete } = props;

  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isNew ? "Create memory" : "Save"}
      </button>
      {!isNew && (
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          Delete
        </button>
      )}
      <SaveText
        saveStatus={collection.saveStatus}
        saveError={collection.saveError}
      />
    </div>
  );
}

interface SaveTextProps {
  saveStatus: UseMemoryCollectionReturn["saveStatus"];
  saveError: string | null;
}

/**
 * Inline save status: "Saving…", "Saved", or the error message.
 * @param props - Save-text props
 * @returns Status element (or null when idle)
 */
function SaveText(props: SaveTextProps): preact.JSX.Element | null {
  const { saveStatus, saveError } = props;

  if (saveStatus === "saving") {
    return <span className="text-xs text-zinc-500">Saving…</span>;
  }

  if (saveStatus === "error") {
    return (
      <span className="text-xs text-red-600 dark:text-red-400">
        {saveError ?? "Save failed"}
      </span>
    );
  }

  if (saveStatus === "saved") {
    return (
      <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
    );
  }

  return null;
}
