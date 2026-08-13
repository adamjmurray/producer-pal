// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared right-pane form chrome for the collection managers (memory, custom
// skills): a labeled Field row, the create-editable / edit-readonly NameField,
// and the Save/Delete + status EditorFooter. The domain-specific fields (custom
// skills' enabled toggle) live in each collection's own editor; these are the
// parts they have in common so the two editors read identically.

import { TrashIcon } from "#webui/components/chat/controls/header/HeaderIcons";
import { CharTokenCount } from "#webui/components/context/collection/CharTokenCount";
import { MarkdownEditor } from "#webui/components/context/MarkdownEditor";
import { type SaveStatus } from "#webui/hooks/context/use-doc";

/** Shared input styling for the collection editors' text controls. */
export const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60";

interface FieldProps {
  label: string;
  hint?: string;
  /** A validation message shown in red below the control when present. */
  error?: string;
  children: preact.ComponentChildren;
}

/**
 * The shared input class, plus a red error ring when the field is invalid.
 * @param error - The field's validation message, if any
 * @returns The input's className
 */
export function inputClass(error?: string): string {
  return error == null ? INPUT_CLASS : `${INPUT_CLASS} ring-2 ring-red-500/50`;
}

/**
 * A labeled form row: a small heading (with optional hint) above its control,
 * plus a red validation message below it when `error` is set.
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
      {props.error != null && (
        <span className="text-xs text-red-600 dark:text-red-400">
          {props.error}
        </span>
      )}
    </label>
  );
}

interface NameFieldProps {
  isNew: boolean;
  name: string;
  displayName?: string;
  placeholder: string;
  onChange: (name: string) => void;
  /** Mark the create-mode name field touched (for deferred validation). */
  onBlur?: () => void;
  /** Validation message for the create-mode name field. */
  error?: string;
  /**
   * Rename an existing entry, committed on blur / Enter. When provided (and not
   * creating), the slug becomes an editable field; without it the slug stays
   * read-only (the collection doesn't support renaming).
   */
  onRename?: (name: string) => void;
}

/**
 * The name row. Creating: an editable slug input for the new draft. Editing:
 * an editable slug that renames on blur / Enter when `onRename` is supplied
 * (Escape reverts), else the fixed slug shown read-only.
 * @param props - Name field props
 * @returns Name field element
 */
export function NameField(props: NameFieldProps): preact.JSX.Element {
  const { isNew, name, displayName, placeholder, onChange, onRename } = props;

  if (isNew) {
    return (
      <Field
        label="Name"
        hint="Letters and digits; spaces become hyphens."
        error={props.error}
      >
        <input
          type="text"
          value={name}
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          onBlur={props.onBlur}
          placeholder={placeholder}
          className={inputClass(props.error)}
        />
      </Field>
    );
  }

  if (onRename != null) {
    return (
      <Field
        label="Name"
        hint="Edit to rename (commits on Enter or blur)."
        error={props.error}
      >
        <input
          type="text"
          value={name}
          aria-label="Rename"
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          onBlur={() => onRename(name)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") onChange(displayName ?? "");
          }}
          className={`${inputClass(props.error)} font-mono`}
        />
      </Field>
    );
  }

  return (
    <Field label="Name">
      <div className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
        {displayName}
      </div>
    </Field>
  );
}

interface DescriptionFieldProps {
  hint: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
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
    <Field label="Description" hint={props.hint} error={props.error}>
      <input
        type="text"
        value={props.value}
        onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
        onBlur={props.onBlur}
        className={inputClass(props.error)}
      />
    </Field>
  );
}

interface BodyFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Remount key for the (uncontrolled, seed-only) markdown editor. Bump it when
   * the parent reseeds the body without a full editor remount — an
   * external-update reload — so the adopted content actually reaches the editor.
   */
  editorKey: number;
  /** Tailwind height for the fixed-height editor frame (e.g. "h-72"). */
  heightClass: string;
  onBlur?: () => void;
  error?: string;
}

/**
 * The main body row: a markdown editor (headings/emphasis render, matching the
 * other context editors) with a live character/token count below it. The label
 * (e.g. "Memory", "Instructions") and height differ per collection. The
 * validation error sits on the count row (right by the input), not below it, so
 * it reads next to the field like the name/description errors. Unlike the name
 * and description inputs the editor is NOT wrapped in a <label> — a <label>
 * around its contenteditable region would hijack clicks/focus — so the label is
 * a plain heading and the editor carries its own accessible name (ariaLabel).
 * @param props - Body field props
 * @returns Body field element
 */
export function BodyField(props: BodyFieldProps): preact.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
        {props.label}
      </span>
      <MarkdownEditor
        key={props.editorKey}
        ariaLabel={props.label}
        initialValue={props.value}
        readOnly={false}
        onChange={props.onChange}
        onBlur={props.onBlur}
        className={props.heightClass}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-red-600 dark:text-red-400">
          {props.error}
        </span>
        <CharTokenCount chars={props.value.length} />
      </div>
    </div>
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
  /**
   * Delete this entry — renders a trash button (existing entries only) when
   * provided. Omitted when delete lives elsewhere (memory's per-row trash).
   */
  onDelete?: () => void;
}

/**
 * The action row: Save (primary; the create label when new), an optional Delete
 * (existing entries only, when `onDelete` is supplied), and the inline save
 * status / error text.
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
      {!isNew && onDelete != null && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete"
          title="Delete"
          className="rounded p-1 text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
        >
          <TrashIcon />
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
