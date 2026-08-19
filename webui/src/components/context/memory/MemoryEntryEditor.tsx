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
import { type SaveStatus } from "#webui/hooks/context/use-doc";
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
  /**
   * Called after a successful rename with the old and new slugs. Distinct from
   * `onSaved` because it must NOT remount this editor — the live draft is only
   * here (see {@link CollectionEditorRenderArgs.onRenamed}).
   */
  onRenamed: (from: string, to: string) => void;
}

/**
 * Right-pane form for one memory: an editable name (rename in place, or the new
 * draft's slug), a one-line description, and a markdown body. Keyed by the
 * selection in the parent so the local draft re-seeds when another memory is
 * picked — but NOT by a rename, which keeps this instance (and its draft) alive
 * while the entry changes slug underneath it (see {@link useMemoryRename}).
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
  const { collection, entry, onSaved, onRenamed } = props;
  const isNew = entry == null;
  const [name, setName] = useState(entry?.name ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  // Remount key for the seed-only body editor; bumped on an external reload so
  // the adopted body reaches the (otherwise uncontrolled) markdown editor.
  const [bodyEditorKey, setBodyEditorKey] = useState(0);

  const targetName = isNew ? name : entry.name;
  const validation = useMemoryValidation(isNew, name, description, body);
  // Gate the write on the fields it actually writes. Creating, that's all three.
  // Editing, the name field is a rename control and the write targets
  // entry.name, so an emptied name must only refuse the rename — gating the
  // autosave on it too would silently discard a body/description edit typed
  // before the name was cleared.
  // Deliberately not gated on an in-flight save: the autosave hook chains
  // overlapping writes, and gating here would drop its unmount flush mid-save.
  const canSave = isNew ? validation.isValid : validation.contentValid;

  // Creating (or re-creating a memory deleted out from under us) is create-only
  // so it can't silently overwrite an existing entry the name collides with.
  const doSave = (): Promise<MemoryEntryView | null> =>
    collection.saveEntry(targetName, { description, content: body }, isNew);

  const {
    noteSaved,
    externalUpdate,
    adoptExternal,
    settlePendingSave,
    resumePendingSave,
  } = useCollectionEntryAutosave({
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
    settlePendingSave,
    resumePendingSave,
    onRenamed,
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
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
  /** The collection hook (owns renameEntry). */
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
  /** Advance the autosave baseline to the renamed entry's echo. */
  noteSaved: (echoKey: string) => void;
  /** Settle the idle autosave (which targets the OLD slug) before renaming. */
  settlePendingSave: () => Promise<void>;
  /** Put a dirty draft back on the autosave clock once the rename is over. */
  resumePendingSave: () => void;
  /** Follow the entry to its new slug, keeping this editor mounted. */
  onRenamed: (from: string, to: string) => void;
}

/**
 * The name field's error plus its change/rename handlers. The error is a
 * required-field miss, else the reason a rename was refused (a collision, a
 * server-rejected slug, a request that timed out), cleared as soon as the user
 * edits the name. The rename's own message is pinned in local state rather than
 * read off the shared saveError, which the autosave resumed just below clears
 * on its next write. An
 * emptied/unchanged name never renames (an emptied one keeps its required error
 * visible; an unchanged one just normalizes whitespace). The current draft
 * fields ride along on the write so a dirty body isn't lost.
 *
 * On success the editor stays MOUNTED and follows the entry to its new slug
 * (`onRenamed`): remounting would re-seed the fields from the server's echo,
 * silently dropping anything typed during the rename's round trip. The name
 * field adopts the server's slug, and the baseline advances to that echo, so a
 * draft that did diverge mid-rename is left dirty for the autosave to persist
 * under the NEW name — and a clean one doesn't re-save.
 *
 * The idle autosave is settled BEFORE the rename is dispatched and held off
 * until it returns ({@link CollectionEntryAutosaveReturn.settlePendingSave}):
 * both writes target the current slug, and a save still racing the rename can
 * re-create the entry the rename just moved away from.
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
  const { requiredError, noteSaved, settlePendingSave, onRenamed } = params;
  const { resumePendingSave } = params;
  const [renameError, setRenameError] = useState<string | null>(null);

  const nameError = requiredError ?? renameError ?? undefined;

  // Drive the name input and dismiss any stale rename error as the user edits.
  const onNameChange = (value: string): void => {
    setName(value);
    setRenameError(null);
  };

  // Commit a rename on blur / Enter; see the hook's doc for the full contract.
  const commitRename = async (oldName: string, to: string): Promise<void> => {
    // Never leave an autosave of the OLD slug racing the rename — this holds the
    // autosave off for the whole round trip, not just the debounce armed now.
    await settlePendingSave();

    const { entry: renamed, error } = await collection.renameEntry(
      oldName,
      to,
      {
        description,
        content: body,
      },
    );

    // The move is over either way, so put the draft back on the clock: nothing
    // here moves draftKey (it follows entry.name, not the name field), so a body
    // edit typed before or during the rename would otherwise sit off the clock
    // until the next keystroke.
    resumePendingSave();

    if (renamed == null) {
      setRenameError(error);
      setName(oldName);

      return;
    }

    setRenameError(null);
    setName(renamed.name);
    noteSaved(memoryEntryKey(renamed));
    onRenamed(oldName, renamed.name);
  };

  const onRename = (raw: string): void => {
    if (entry == null) return;
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed === entry.name) {
      if (trimmed !== "") setName(entry.name);

      return;
    }

    void commitRename(entry.name, trimmed);
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
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
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
  /**
   * Whether the two fields an existing memory's write carries (description,
   * body) are non-empty. Excludes the name, which is that mode's rename
   * control rather than part of the write.
   */
  contentValid: boolean;
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
 * modes, but they don't block the same things: emptying an existing memory's
 * name shows the error and refuses the rename (the field stays empty until a
 * valid name is typed) while its description and body keep autosaving —
 * see `contentValid`.
 * @param isNew - Whether this is a new (create) draft
 * @param name - The current name draft (or the rename value for an existing one)
 * @param description - The current description draft
 * @param body - The current body draft
 * @returns The per-field errors, both validity flags, and touch controls
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
  const contentValid = description.trim() !== "" && body.trim() !== "";
  const isValid = !nameMissing && contentValid;

  return { errors, isValid, contentValid, markTouched, revealAll };
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
