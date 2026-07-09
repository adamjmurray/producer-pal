// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared right-pane form chrome for the collection managers (memory, custom
// skills): a labeled Field row, the create-editable / edit-readonly NameField,
// and the Save/Delete + status EditorFooter. The domain-specific fields (custom
// skills' enabled toggle) live in each collection's own editor; these are the
// parts they have in common so the two editors read identically.

import { CharTokenCount } from "#webui/components/context/collection/CharTokenCount";
import { type SaveStatus } from "#webui/hooks/context/use-doc-memory";

/** Shared input styling for the collection editors' text controls. */
export const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60";

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
export function Field(props: FieldProps): preact.JSX.Element {
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

interface NameFieldProps {
  isNew: boolean;
  name: string;
  displayName?: string;
  placeholder: string;
  onChange: (name: string) => void;
}

/**
 * The name row: an editable slug input when creating, or the fixed slug (shown
 * read-only) when editing an existing entry — the slug is the stable handle, so
 * a rename is a delete + create, not an in-place edit.
 * @param props - Name field props
 * @returns Name field element
 */
export function NameField(props: NameFieldProps): preact.JSX.Element {
  const { isNew, name, displayName, placeholder, onChange } = props;

  if (!isNew) {
    return (
      <Field label="Name">
        <div className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
          {displayName}
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
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

interface DescriptionFieldProps {
  hint: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * The one-line description row: a text input whose value becomes the entry's
 * recall hook in the index. The hint text differs per collection.
 * @param props - Description field props
 * @returns Description field element
 */
export function DescriptionField(
  props: DescriptionFieldProps,
): preact.JSX.Element {
  return (
    <Field label="Description" hint={props.hint}>
      <input
        type="text"
        value={props.value}
        onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

interface BodyFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}

/**
 * The main body row: a monospace textarea with a live character/token count.
 * The label (e.g. "Memory", "Instructions") and row count differ per collection.
 * @param props - Body field props
 * @returns Body field element
 */
export function BodyField(props: BodyFieldProps): preact.JSX.Element {
  return (
    <Field label={props.label}>
      <textarea
        value={props.value}
        onInput={(e) => props.onChange((e.target as HTMLTextAreaElement).value)}
        rows={props.rows}
        className={`${INPUT_CLASS} resize-none font-mono leading-relaxed`}
      />
      <div className="mt-1 flex justify-end">
        <CharTokenCount chars={props.value.length} />
      </div>
    </Field>
  );
}

interface EditorFooterProps {
  saveStatus: SaveStatus;
  saveError: string | null;
  isNew: boolean;
  canSave: boolean;
  /** Primary-button label when creating (e.g. "Create memory"). */
  createLabel: string;
  onSave: () => void;
  onDelete: () => void;
}

/**
 * The action row: Save (primary; the create label when new), Delete (existing
 * entries only), and the inline save status / error text.
 * @param props - Footer props
 * @returns Footer element
 */
export function EditorFooter(props: EditorFooterProps): preact.JSX.Element {
  const {
    saveStatus,
    saveError,
    isNew,
    canSave,
    createLabel,
    onSave,
    onDelete,
  } = props;

  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isNew ? createLabel : "Save"}
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
      <SaveText saveStatus={saveStatus} saveError={saveError} />
    </div>
  );
}

interface SaveTextProps {
  saveStatus: SaveStatus;
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
