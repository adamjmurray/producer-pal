// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "preact/hooks";
import {
  type CollectionEntryAutosaveReturn,
  useCollectionEntryAutosave,
} from "#webui/hooks/context/helpers/use-doc-collection";
import {
  type MemoryEntryView,
  type UseMemoryCollectionReturn,
} from "#webui/hooks/context/use-memory-collection";

/** What {@link useMemoryEntrySave} needs from the editor's live draft. */
export interface MemoryEntrySaveParams {
  /** The collection hook (per-entry save lives here). */
  collection: UseMemoryCollectionReturn;
  /** The entry being edited, or null when creating a new one. */
  entry: MemoryEntryView | null;
  /** The slug the write targets: the name draft when new, else the entry's. */
  targetName: string;
  /** The current description draft. */
  description: string;
  /** The current body draft. */
  body: string;
  /** Whether this is a new (create) draft. */
  isNew: boolean;
  /** Whether the fields this mode writes are filled in. */
  canSave: boolean;
  /** The per-field validation state (the Create button's gate). */
  validation: MemoryValidation;
  /** Called after a successful save with the stored entry's slug. */
  onSaved: (name: string) => void;
}

/** The autosave's own controls, plus the create flow's button handler. */
export interface MemoryEntrySave extends CollectionEntryAutosaveReturn {
  /** Create button: reveal the errors, or persist the draft. */
  handleCreate: () => void;
}

/**
 * The editor's write path: the autosave wiring for an existing memory, and the
 * explicit Create for a new one. Both go through the same create-only save, so
 * a new draft can't silently overwrite an entry its name collides with.
 * @param params - The live draft, its validation, and the collection
 * @returns The autosave controls plus the Create button's handler
 */
export function useMemoryEntrySave(
  params: MemoryEntrySaveParams,
): MemoryEntrySave {
  const { collection, entry, targetName, description, body } = params;
  const { isNew, canSave, validation, onSaved } = params;

  // Create-only when new (or re-creating a memory deleted out from under us).
  const doSave = (): Promise<MemoryEntryView | null> =>
    collection.saveEntry(targetName, { description, content: body }, isNew);

  const autosave = useCollectionEntryAutosave({
    canSave,
    draftKey: memoryEntryKey({ name: targetName, description, body }),
    autosaveOnIdle: !isNew,
    // A new draft is created only by the explicit Create button — never
    // silently flushed on navigate-away. Leaving a dirty new draft is guarded
    // by a discard confirm (useDraftLeaveGuard) instead.
    flushOnLeave: !isNew,
    persist: async () => {
      const saved = await doSave();

      return saved ? memoryEntryKey(saved) : null;
    },
    externalKey: entry != null ? memoryEntryKey(entry) : undefined,
  });

  const handleSave = async (): Promise<void> => {
    const saved = await doSave();

    if (saved) {
      autosave.noteSaved(memoryEntryKey(saved));
      onSaved(saved.name);
    }
  };

  // Reveal every field's error when the draft is incomplete, so a blank field
  // can't silently disable the button with no explanation.
  const handleCreate = (): void => {
    if (!validation.isValid) {
      validation.revealAll();

      return;
    }

    void handleSave();
  };

  return { ...autosave, handleCreate };
}

/** The three required memory fields. */
export type MemoryField = "name" | "description" | "body";

/** Per-field validation state for the memory editor. */
export interface MemoryValidation {
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
export function useMemoryValidation(
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
export function memoryEntryKey(fields: {
  name: string;
  description: string;
  body: string;
}): string {
  return JSON.stringify([fields.name, fields.description, fields.body]);
}
