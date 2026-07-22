// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "preact/hooks";
import {
  BodyField,
  DescriptionField,
  NameField,
} from "#webui/components/context/collection/collection-editor-parts";
import { useDraftLeaveGuard } from "#webui/components/context/collection/leave-guard";
import { ExternalUpdateBanner } from "#webui/components/context/ContextScreen";
import { useCollectionEntryAutosave } from "#webui/hooks/context/use-doc-collection";
import { type SaveStatus } from "#webui/hooks/context/use-doc-memory";
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
 * Right-pane form for one memory: an editable name (rename in place, or the new
 * draft's slug), a one-line description, and a markdown body. Keyed by the
 * selected entry in the parent so the local draft re-seeds on selection change.
 *
 * An existing memory autosaves — there is no Save button; the save state shows
 * in the header (see {@link CollectionScreen}). A new memory is created only by
 * the explicit Create button. The list polls for the assistant's own writes,
 * surfacing a Reload banner when this entry changed elsewhere while the draft
 * here is clean.
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
  // Remount key for the seed-only body editor; bumped on an external reload so
  // the adopted body reaches the (otherwise uncontrolled) markdown editor.
  const [bodyEditorKey, setBodyEditorKey] = useState(0);

  const targetName = isNew ? name : entry.name;
  const validation = useMemoryValidation(isNew, name, description, body);
  // Autosave/create only when name (new only), description, and body are all
  // non-empty — clearing a required field blocks the write and shows its error.
  const canSave = validation.isValid && collection.saveStatus !== "saving";

  // Creating (or re-creating a memory deleted out from under us) is create-only
  // so it can't silently overwrite an existing entry the name collides with.
  const doSave = (): Promise<MemoryEntryView | null> =>
    collection.saveEntry(targetName, { description, content: body }, isNew);

  const { noteSaved, externalUpdate, adoptExternal } =
    useCollectionEntryAutosave({
      canSave,
      draftKey: memoryEntryKey({ name: targetName, description, body }),
      autosaveOnIdle: !isNew,
      // A new draft is created only by the explicit Create button — never
      // silently flushed on navigate-away. Leaving a dirty new draft is guarded
      // by a discard confirm (useNewMemoryLeaveGuard) instead.
      flushOnLeave: !isNew,
      persist: async () => {
        const saved = await doSave();

        return saved ? memoryEntryKey(saved) : null;
      },
      externalKey: entry != null ? memoryEntryKey(entry) : undefined,
    });

  // A new draft with any field filled guards against silent loss: leaving it
  // (select another memory, switch tabs, close, or close the browser tab)
  // confirms a discard first. A blank draft (or an existing entry) guards
  // nothing.
  const isDirtyNew =
    isNew &&
    (name.trim() !== "" || description.trim() !== "" || body.trim() !== "");

  useDraftLeaveGuard(isDirtyNew, DISCARD_NEW_MEMORY_MESSAGE);

  // The name field's error + change/rename handlers (rename commit, and
  // surfacing a failed rename's reason under the field). See useMemoryRename.
  const { nameError, onNameChange, onRename } = useMemoryRename({
    collection,
    entry,
    setName,
    description,
    body,
    requiredError: validation.errors.name,
    noteSaved,
    onSaved,
  });

  const handleSave = async (): Promise<void> => {
    const saved = await doSave();

    if (saved) {
      noteSaved(memoryEntryKey(saved));
      onSaved(saved.name);
    }
  };

  // Create button: reveal every field's error when the draft is incomplete
  // (so a blank field can't silently disable the button with no explanation),
  // otherwise persist it.
  const handleCreate = (): void => {
    if (!validation.isValid) {
      validation.revealAll();

      return;
    }

    void handleSave();
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
    setBodyEditorKey((key) => key + 1);
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
        onChange={onNameChange}
        onBlur={() => validation.markTouched("name")}
        error={nameError}
        onRename={onRename}
      />
      <DescriptionField
        hint="One-line recall hook shown in the index."
        value={description}
        onChange={setDescription}
        onBlur={() => validation.markTouched("description")}
        error={validation.errors.description}
      />
      <BodyField
        label="Memory"
        value={body}
        onChange={setBody}
        editorKey={bodyEditorKey}
        heightClass="h-72"
        onBlur={() => validation.markTouched("body")}
        error={validation.errors.body}
      />
      {isNew && (
        <CreateMemoryFooter
          onCreate={handleCreate}
          saveStatus={collection.saveStatus}
          saveError={collection.saveError}
        />
      )}
    </div>
  );
}

// --- Helpers below main export ---

/** Confirm text shown before abandoning an unsaved new-memory draft. */
const DISCARD_NEW_MEMORY_MESSAGE =
  "Discard this new memory? Your changes will be lost.";

/** What {@link useMemoryRename} needs from the editor's live draft. */
interface MemoryRenameParams {
  /** The collection hook (owns renameEntry + the shared saveError). */
  collection: UseMemoryCollectionReturn;
  /** The entry being edited, or null when creating (no rename in that mode). */
  entry: MemoryEntryView | null;
  /** Set the name draft (revert on a failed/empty rename). */
  setName: (name: string) => void;
  /** The current description draft (carried into the rename write). */
  description: string;
  /** The current body draft (carried into the rename write). */
  body: string;
  /** The client-side required-name error; it takes priority over a rename error. */
  requiredError?: string;
  /** Advance the autosave baseline for the OLD name after a successful rename. */
  noteSaved: (echoKey: string) => void;
  /** Navigate to the renamed entry's new slug. */
  onSaved: (name: string) => void;
}

/**
 * The name field's error plus its change/rename handlers. The error is a
 * required-field miss, else the reason a rename was refused (a name collision or
 * a server-rejected slug) — read fresh from the collection each render, not off
 * the stale rename closure — cleared as soon as the user edits the name. An
 * emptied/unchanged name never renames (an emptied one keeps its required error
 * visible; an unchanged one just normalizes whitespace). On success, the OLD
 * name's draft is marked saved so the navigation's unmount flush can't re-create
 * the old slug; the current draft fields ride along so a dirty body isn't lost.
 * Extracted so the editor body stays within the line limit.
 * @param params - The live draft + collection the rename needs
 * @returns The name field's error and its change/rename handlers
 */
function useMemoryRename(params: MemoryRenameParams): {
  nameError?: string;
  onNameChange: (value: string) => void;
  onRename: (raw: string) => void;
} {
  const { collection, entry, setName, description, body } = params;
  const { requiredError, noteSaved, onSaved } = params;
  const [renameFailed, setRenameFailed] = useState(false);

  const nameError =
    requiredError ??
    (renameFailed ? (collection.saveError ?? undefined) : undefined);

  // Drive the name input and dismiss any stale rename error as the user edits.
  const onNameChange = (value: string): void => {
    setName(value);
    setRenameFailed(false);
  };

  // Commit a rename on blur / Enter; see the hook's doc for the full contract.
  const onRename = (raw: string): void => {
    if (entry == null) return;
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed === entry.name) {
      if (trimmed !== "") setName(entry.name);

      return;
    }

    void collection
      .renameEntry(entry.name, trimmed, { description, content: body })
      .then((renamed) => {
        if (renamed == null) {
          setRenameFailed(true);
          setName(entry.name);

          return;
        }

        setRenameFailed(false);
        noteSaved(memoryEntryKey({ name: entry.name, description, body }));
        onSaved(renamed.name);
      });
  };

  return { nameError, onNameChange, onRename };
}

/**
 * The create-flow footer: the Create button plus an inline error when a create
 * fails (an existing memory autosaves instead, showing its status in the header).
 * @param props - Footer props
 * @param props.onCreate - Validate + create the draft
 * @param props.saveStatus - The collection's current save status
 * @param props.saveError - The collection's current save error, if any
 * @returns Footer element
 */
function CreateMemoryFooter(props: {
  onCreate: () => void;
  saveStatus: SaveStatus;
  saveError: string | null;
}): preact.JSX.Element {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        type="button"
        onClick={props.onCreate}
        disabled={props.saveStatus === "saving"}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Create memory
      </button>
      {props.saveStatus === "error" && (
        <span className="text-xs text-red-600 dark:text-red-400">
          {props.saveError ?? "Save failed"}
        </span>
      )}
    </div>
  );
}

/** The three required memory fields. */
type MemoryField = "name" | "description" | "body";

/** Per-field validation state for the memory editor. */
interface MemoryValidation {
  /** The error message for each field, or undefined when valid/untouched. */
  errors: Partial<Record<MemoryField, string>>;
  /** Whether every required field (name, description, body) is non-empty. */
  isValid: boolean;
  /** Mark a field touched so its error can surface (on blur). */
  markTouched: (field: MemoryField) => void;
  /** Reveal every field's error (a failed Create). */
  revealAll: () => void;
}

/**
 * Track required-field validity + which fields have been touched, so errors are
 * deferred: a blank new form stays quiet until a field is left or Create is
 * attempted, while an existing memory starts "touched" so an already-empty
 * required field (e.g. an assistant-made memory with no description) is flagged
 * immediately. All three fields (name, description, body) are required in both
 * modes: emptying an existing memory's name shows the error and blocks the save
 * (the rename control keeps the field empty until a valid name is typed) just
 * like the description and body.
 * @param isNew - Whether this is a new (create) draft
 * @param name - The current name draft (or the rename value for an existing one)
 * @param description - The current description draft
 * @param body - The current body draft
 * @returns The per-field errors, overall validity, and touch controls
 */
function useMemoryValidation(
  isNew: boolean,
  name: string,
  description: string,
  body: string,
): MemoryValidation {
  const [touched, setTouched] = useState<Record<MemoryField, boolean>>(() => ({
    name: !isNew,
    description: !isNew,
    body: !isNew,
  }));

  const markTouched = useCallback((field: MemoryField): void => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const revealAll = useCallback((): void => {
    setTouched({ name: true, description: true, body: true });
  }, []);

  const nameMissing = name.trim() === "";
  const errors: Partial<Record<MemoryField, string>> = {
    name: touched.name && nameMissing ? "Name is required." : undefined,
    description:
      touched.description && description.trim() === ""
        ? "Description is required."
        : undefined,
    body:
      touched.body && body.trim() === ""
        ? "Memory contents are required."
        : undefined,
  };
  const isValid =
    !nameMissing && description.trim() !== "" && body.trim() !== "";

  return { errors, isValid, markTouched, revealAll };
}

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
