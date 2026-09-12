// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";

/** The three fields every collection entry's form edits. */
export interface CollectionEntryFields {
  name: string;
  description: string;
  body: string;
}

/** The editor's local draft: the three fields, plus what every editor derives. */
export interface CollectionEntryDraft extends CollectionEntryFields {
  setName: (value: string) => void;
  setDescription: (value: string) => void;
  setBody: (value: string) => void;
  /** Remount key for the seed-only body editor; bumped by {@link reseed}. */
  bodyEditorKey: number;
  /** Whether this is a new (create) draft. */
  isNew: boolean;
  /** The slug a write targets: the name draft when new, else the entry's. */
  targetName: string;
  /** A new draft with anything typed in it — what a discard confirm guards. */
  isDirtyNew: boolean;
  /** Adopt the server's fields (an external-update reload). */
  reseed: (fields: CollectionEntryFields) => void;
}

/**
 * The draft state shared by the collection editors (memory, custom skills). The
 * editor is keyed by the parent's selection, so the initial values seed it once
 * per entry; fields a single collection carries (custom skills' `enabled`) stay
 * in that editor.
 * @param entry - The entry being edited, or null when creating a new one
 * @returns The draft fields, their setters, and the derived flags
 */
export function useCollectionEntryDraft(
  entry: CollectionEntryFields | null,
): CollectionEntryDraft {
  const [name, setName] = useState(entry?.name ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [bodyEditorKey, setBodyEditorKey] = useState(0);
  const isNew = entry == null;

  const reseed = (fields: CollectionEntryFields): void => {
    setName(fields.name);
    setDescription(fields.description);
    setBody(fields.body);
    // The markdown editor is uncontrolled and seeds once, so the adopted body
    // only reaches it through a remount.
    setBodyEditorKey((key) => key + 1);
  };

  return {
    name,
    setName,
    description,
    setDescription,
    body,
    setBody,
    bodyEditorKey,
    isNew,
    targetName: isNew ? name : entry.name,
    isDirtyNew:
      isNew &&
      (name.trim() !== "" || description.trim() !== "" || body.trim() !== ""),
    reseed,
  };
}
